import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, getAccessToken } from "./client";
import { FALLBACK_CATEGORY, normalizeCategory } from "../category";
import type { Receipt, ReceiptItem } from "../types";
import { openDb, loadReceipts, loadReceiptItems } from "../storage";
import type { ReceiptItemSchema, ReceiptSchema } from "./generated/types.gen";
import type { AiActionType, AiResult } from "../ai/types";
import { parseServerSections } from "../ai/llmService";

type LocalDatabase = Awaited<ReturnType<typeof openDb>>;
const RECEIPT_PAGE_SIZE = 100;
const PENDING_DELETED_IDS_KEY = "@pending_deleted_receipt_ids";

/**
 * Checks if user is authenticated by verifying access token exists
 */
async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return !!token;
}

/**
 * Sync a single receipt to the server.
 * Maps local Receipt fields to server's ReceiptSchema.
 * Server schema: id, date, store, total, items[{name, quantity, price, sum, product_id}]
 */
export async function syncReceiptToServer(
  receipt: Receipt,
  items: ReceiptItem[],
): Promise<boolean> {
  if (!(await isAuthenticated())) return false;

  await api.createReceipt(toServerReceipt(receipt, items));
  return true;
}

function toServerReceipt(
  receipt: Receipt,
  items: ReceiptItem[],
): ReceiptSchema {
  return {
    id: receipt.id,
    date: receipt.ticketDate.slice(0, 10),
    store: receipt.organization,
    total: Math.abs(receipt.totalSumRub),
    source_key:
      receipt.qrraw.startsWith("manual:") || receipt.qrraw.startsWith("synced:")
        ? null
        : receipt.qrraw,
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: Math.abs(item.priceRub),
      sum: Math.abs(item.sumRub),
    })),
  };
}

/**
 * Pull receipts from server and merge into local SQLite.
 * Prevents duplicates by checking receipt IDs.
 * Maps server's ReceiptSchema fields back to local Receipt/ReceiptItem types.
 * Server schema: id, date, store, total, items[{name, quantity, price, sum, product_id}]
 */
export async function pullServerReceipts(
  db: LocalDatabase,
): Promise<{ receipts: Receipt[]; items: ReceiptItem[] }> {
  const result: { receipts: Receipt[]; items: ReceiptItem[] } = {
    receipts: [],
    items: [],
  };

  if (!(await isAuthenticated())) return result;

  try {
    const serverReceipts: ReceiptSchema[] = [];
    for (let offset = 0; ; offset += RECEIPT_PAGE_SIZE) {
      const page = await api.getReceipts(offset, RECEIPT_PAGE_SIZE);
      serverReceipts.push(...page);
      if (page.length < RECEIPT_PAGE_SIZE) break;
    }

    // Load existing local IDs to avoid duplicates
    const localReceipts = await loadReceipts(db);
    const localIds = new Set(localReceipts.map((r) => r.id));
    const pendingDeletedIds = await getPendingDeletedIds();
    const syncedIds = await getSyncedIds();

    for (const sr of serverReceipts) {
      // A successful server listing is confirmation that this ID is already
      // persisted remotely, including receipts downloaded from another device.
      syncedIds.add(sr.id);
      if (localIds.has(sr.id) || pendingDeletedIds.has(sr.id)) continue;

      const receipt: Receipt = {
        id: sr.id,
        qrraw: `synced:${sr.id}`,
        organization: sr.store || "Синхронизировано",
        ticketDate: sr.date || new Date().toISOString(),
        operationType: 3,
        totalSumRub: sr.total ?? 0,
        sourceCode: 1,
      };
      result.receipts.push(receipt);

      const receiptItems: ReceiptItem[] = (sr.items || []).map(
        (item: ReceiptItemSchema, i: number) => ({
          receiptId: sr.id,
          name: item.name || `Товар ${i + 1}`,
          category: normalizeCategory(item.category ?? FALLBACK_CATEGORY),
          priceRub: Math.abs(item.price ?? 0),
          quantity: item.quantity ?? 1,
          sumRub: Math.abs(item.sum ?? item.price ?? 0),
        }),
      );
      result.items.push(...receiptItems);
    }
    await saveSyncedIds(syncedIds);
  } catch {
    console.warn("Receipt download failed");
  }

  return result;
}

/**
 * Sync all local receipts that haven't been synced to the server.
 * Uses an AsyncStorage set to track synced receipt IDs.
 */
const SYNCED_IDS_KEY = "@synced_receipt_ids";

async function getSyncedIds(): Promise<Set<string>> {
  const stored = await AsyncStorage.getItem(SYNCED_IDS_KEY);
  return parseStoredIds(stored);
}

function parseStoredIds(stored: string | null) {
  if (!stored) return new Set<string>();
  try {
    const value: unknown = JSON.parse(stored);
    return new Set(
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

async function saveSyncedIds(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(SYNCED_IDS_KEY, JSON.stringify([...ids]));
}

function errorStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode;
  return typeof status === "number" ? status : undefined;
}

async function getPendingDeletedIds(): Promise<Set<string>> {
  const stored = await AsyncStorage.getItem(PENDING_DELETED_IDS_KEY);
  return parseStoredIds(stored);
}

async function savePendingDeletedIds(ids: Set<string>): Promise<void> {
  if (ids.size === 0) {
    await AsyncStorage.removeItem(PENDING_DELETED_IDS_KEY);
    return;
  }
  await AsyncStorage.setItem(PENDING_DELETED_IDS_KEY, JSON.stringify([...ids]));
}

/**
 * Persists a local deletion before attempting network work. Pending IDs are
 * excluded from server pulls, so a failed request cannot resurrect a receipt.
 */
export async function queueReceiptDeletion(receiptId: string): Promise<void> {
  const pendingIds = await getPendingDeletedIds();
  pendingIds.add(receiptId);
  await savePendingDeletedIds(pendingIds);
}

/**
 * Retries queued deletions. A 404 is success because the desired server state
 * has already been reached.
 */
export async function syncPendingReceiptDeletions(): Promise<void> {
  if (!(await isAuthenticated())) return;

  const pendingIds = await getPendingDeletedIds();
  if (pendingIds.size === 0) return;

  for (const receiptId of [...pendingIds]) {
    try {
      await api.deleteReceipt(receiptId);
      pendingIds.delete(receiptId);
    } catch (error: unknown) {
      if (errorStatus(error) === 404) {
        pendingIds.delete(receiptId);
      }
    }
  }

  await savePendingDeletedIds(pendingIds);
}

export async function syncAllLocalReceiptsBulk(
  db: LocalDatabase,
): Promise<void> {
  if (!(await isAuthenticated())) return;

  try {
    const receipts = await loadReceipts(db);
    const syncedIds = await getSyncedIds();

    const unsyncedReceipts: ReceiptSchema[] = [];

    for (const receipt of receipts) {
      if (syncedIds.has(receipt.id)) continue;

      const items = await loadReceiptItems(db, receipt.id);
      unsyncedReceipts.push(toServerReceipt(receipt, items));
    }

    if (unsyncedReceipts.length === 0) return;

    try {
      await api.createReceiptsArray(unsyncedReceipts);
    } catch (error: unknown) {
      // If bulk endpoint is not available (405), fall back to individual sync
      if (errorStatus(error) === 405) {
        for (const receipt of receipts) {
          if (syncedIds.has(receipt.id)) continue;
          const items = await loadReceiptItems(db, receipt.id);
          if (await syncReceiptToServer(receipt, items)) {
            syncedIds.add(receipt.id);
          }
        }
        await saveSyncedIds(syncedIds);
        return;
      }
      throw error;
    }

    unsyncedReceipts.forEach((receipt) => syncedIds.add(receipt.id));
    await saveSyncedIds(syncedIds);
  } catch {
    console.warn("Receipt upload failed");
  }
}

export async function syncAllLocalReceipts(db: LocalDatabase): Promise<void> {
  if (!(await isAuthenticated())) return;

  try {
    const receipts = await loadReceipts(db);
    const syncedIds = await getSyncedIds();

    for (const receipt of receipts) {
      if (syncedIds.has(receipt.id)) continue;

      const items = await loadReceiptItems(db, receipt.id);
      if (await syncReceiptToServer(receipt, items)) {
        syncedIds.add(receipt.id);
      }
    }
    await saveSyncedIds(syncedIds);
  } catch {
    console.warn("Receipt upload failed");
  }
}

/**
 * Sync AI reports from server to local SQLite.
 * Fetches AI history from server and saves any reports not yet stored locally.
 */
const SYNCED_AI_IDS_KEY = "@synced_ai_report_ids";

async function getSyncedAiIds(): Promise<Set<string>> {
  const stored = await AsyncStorage.getItem(SYNCED_AI_IDS_KEY);
  return parseStoredIds(stored);
}

async function markAiAsSynced(id: string): Promise<void> {
  const synced = await getSyncedAiIds();
  synced.add(id);
  await AsyncStorage.setItem(SYNCED_AI_IDS_KEY, JSON.stringify([...synced]));
}

export async function syncAiReports(db: LocalDatabase): Promise<void> {
  if (!(await isAuthenticated())) return;

  try {
    const serverReports = await api.getAiHistory();
    const syncedIds = await getSyncedAiIds();

    for (const sr of serverReports) {
      if (syncedIds.has(sr.id)) continue;

      // Save to local AI reports table
      const { saveAiReport } = await import("../ai/storage");
      const { ACTION_TO_SERVER, ACTION_LABELS } = await import("../ai/types");

      // Find the local action type from server action
      const actionEntries = Object.entries(ACTION_TO_SERVER) as [
        AiActionType,
        string,
      ][];
      const localAction =
        actionEntries.find(
          ([, serverAction]) => serverAction === sr.action,
        )?.[0] ?? "analysis";

      const snapshot = {
        receiptCount: 0,
        receiptIds: [],
      };

      const response: AiResult = {
        id: sr.id,
        type: localAction,
        title: ACTION_LABELS[localAction] || "Анализ",
        summary: "",
        sections: parseServerSections(sr.sections || []),
      };

      await saveAiReport(db, localAction, snapshot, response);
      await markAiAsSynced(sr.id);
    }
  } catch {
    console.warn("AI report synchronization failed");
  }
}
