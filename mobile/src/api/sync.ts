import { api, getAccessToken } from "./client";
import type { Receipt, ReceiptItem } from "../types";
import { openDb, loadReceipts, loadReceiptItems } from "../storage";

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
): Promise<void> {
  if (!(await isAuthenticated())) return;

  try {
    await api.createReceipt({
      id: receipt.id,
      date: receipt.ticketDate,
      store: receipt.organization,
      total: Math.abs(receipt.totalSumRub),
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: Math.abs(item.priceRub),
        sum: Math.abs(item.sumRub),
      })),
    });
  } catch (e) {
    console.warn("Failed to sync receipt to server", e);
  }
}

/**
 * Pull receipts from server and merge into local SQLite.
 * Prevents duplicates by checking receipt IDs.
 * Maps server's ReceiptSchema fields back to local Receipt/ReceiptItem types.
 * Server schema: id, date, store, total, items[{name, quantity, price, sum, product_id}]
 */
export async function pullServerReceipts(
  db: any,
): Promise<{ receipts: Receipt[]; items: ReceiptItem[] }> {
  const result: { receipts: Receipt[]; items: ReceiptItem[] } = {
    receipts: [],
    items: [],
  };

  if (!(await isAuthenticated())) return result;

  try {
    const serverReceipts: any[] = await api.getReceipts();

    // Load existing local IDs to avoid duplicates
    const localReceipts = await loadReceipts(db);
    const localIds = new Set(localReceipts.map((r) => r.id));

    for (const sr of serverReceipts) {
      if (localIds.has(sr.id)) continue;

      const receipt: Receipt = {
        id: sr.id,
        qrraw: `synced:${sr.id}`,
        organization: sr.store || "Синхронизировано",
        ticketDate: sr.date || new Date().toISOString(),
        operationType: 3,
        totalSumRub: sr.total ?? 0,
        sourceCode: 1,
        createdAt: Date.now(),
      };
      result.receipts.push(receipt);

      const receiptItems: ReceiptItem[] = (sr.items || []).map(
        (item: any, i: number) => ({
          receiptId: sr.id,
          name: item.name || `Товар ${i + 1}`,
          category: item.category || "другое",
          priceRub: Math.abs(item.price ?? 0),
          quantity: item.quantity ?? 1,
          sumRub: Math.abs(item.sum ?? item.price ?? 0),
        }),
      );
      result.items.push(...receiptItems);
    }
  } catch (e) {
    console.warn("Failed to pull receipts from server", e);
  }

  return result;
}

/**
 * Sync all local receipts that haven't been synced to the server.
 * Uses an AsyncStorage set to track synced receipt IDs.
 */
const SYNCED_IDS_KEY = "@synced_receipt_ids";

async function getSyncedIds(): Promise<Set<string>> {
  const { default: AsyncStorage } =
    await import("@react-native-async-storage/async-storage");
  const stored = await AsyncStorage.getItem(SYNCED_IDS_KEY);
  return new Set(stored ? JSON.parse(stored) : []);
}

async function markAsSynced(id: string): Promise<void> {
  const { default: AsyncStorage } =
    await import("@react-native-async-storage/async-storage");
  const synced = await getSyncedIds();
  synced.add(id);
  await AsyncStorage.setItem(SYNCED_IDS_KEY, JSON.stringify([...synced]));
}

export async function syncAllLocalReceiptsBulk(db: any): Promise<void> {
  if (!(await isAuthenticated())) return;

  try {
    const receipts = await loadReceipts(db);
    const syncedIds = await getSyncedIds();

    const unsyncedReceipts: any[] = [];

    for (const receipt of receipts) {
      if (syncedIds.has(receipt.id)) continue;

      const items = await loadReceiptItems(db, receipt.id);
      unsyncedReceipts.push({
        id: receipt.id,
        date: receipt.ticketDate,
        store: receipt.organization,
        total: Math.abs(receipt.totalSumRub),
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: Math.abs(item.priceRub),
          sum: Math.abs(item.sumRub),
        })),
      });
    }

    if (unsyncedReceipts.length === 0) return;

    try {
      await api.createReceiptsArray(unsyncedReceipts);
    } catch (e: any) {
      // If bulk endpoint is not available (405), fall back to individual sync
      if (e?.status === 405) {
        console.debug(
          "Bulk sync not available, falling back to individual sync",
        );
        for (const receipt of receipts) {
          if (syncedIds.has(receipt.id)) continue;
          const items = await loadReceiptItems(db, receipt.id);
          await syncReceiptToServer(receipt, items);
          await markAsSynced(receipt.id);
        }
        return;
      }
      throw e;
    }

    // Mark all as synced
    for (const r of unsyncedReceipts) {
      await markAsSynced(r.id);
    }
  } catch (e) {
    console.warn("Failed to bulk sync receipts", e);
  }
}

export async function syncAllLocalReceipts(db: any): Promise<void> {
  if (!(await isAuthenticated())) return;

  try {
    const receipts = await loadReceipts(db);
    const syncedIds = await getSyncedIds();

    for (const receipt of receipts) {
      if (syncedIds.has(receipt.id)) continue;

      const items = await loadReceiptItems(db, receipt.id);
      await syncReceiptToServer(receipt, items);
      await markAsSynced(receipt.id);
    }
  } catch (e) {
    console.warn("Failed to sync all local receipts", e);
  }
}

/**
 * Sync AI reports from server to local SQLite.
 * Fetches AI history from server and saves any reports not yet stored locally.
 */
const SYNCED_AI_IDS_KEY = "@synced_ai_report_ids";

async function getSyncedAiIds(): Promise<Set<string>> {
  const { default: AsyncStorage } =
    await import("@react-native-async-storage/async-storage");
  const stored = await AsyncStorage.getItem(SYNCED_AI_IDS_KEY);
  return new Set(stored ? JSON.parse(stored) : []);
}

async function markAiAsSynced(id: string): Promise<void> {
  const { default: AsyncStorage } =
    await import("@react-native-async-storage/async-storage");
  const synced = await getSyncedAiIds();
  synced.add(id);
  await AsyncStorage.setItem(SYNCED_AI_IDS_KEY, JSON.stringify([...synced]));
}

export async function syncAiReports(db: any): Promise<void> {
  if (!(await isAuthenticated())) return;

  try {
    const serverReports: any[] = await api.getAiHistory();
    const syncedIds = await getSyncedAiIds();

    for (const sr of serverReports) {
      if (syncedIds.has(sr.id)) continue;

      // Save to local AI reports table
      const { saveAiReport } = await import("../ai/storage");
      const { ACTION_TO_SERVER, ACTION_LABELS } = await import("../ai/types");

      // Find the local action type from server action
      const localAction =
        Object.entries(ACTION_TO_SERVER).find(
          ([_, v]) => v === sr.action,
        )?.[0] || "analysis";

      const snapshot = {
        receiptCount: 0,
        receiptIds: [],
      };

      const response = {
        id: sr.id,
        type: localAction as any,
        title:
          ACTION_LABELS[localAction as keyof typeof ACTION_LABELS] || "Анализ",
        summary: "",
        sections: (sr.sections || []).map((s: any) => ({
          type: s.type || "text",
          title: s.title || "",
          text: s.text,
          value: s.value,
          max: s.max,
          items: s.items,
          products: s.products,
          labels: s.labels,
          values: s.values,
          kind: s.kind,
        })),
      };

      await saveAiReport(db, localAction as any, snapshot, response);
      await markAiAsSynced(sr.id);
    }
  } catch (e) {
    console.warn("Failed to sync AI reports", e);
  }
}
