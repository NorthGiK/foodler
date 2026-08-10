import * as SQLite from "expo-sqlite";
import {
  detectCategory,
  normalizeCategory,
  normalizeServerCategory,
} from "./category";
import {
  batchReceiptChanges,
  notifyReceiptChange,
  subscribeToReceiptChanges,
} from "./features/receipts/receiptChanges";
import { ApiReceiptResponse, Receipt, ReceiptItem } from "./types";

const DB_NAME = "food_spend_tracker.db";

let _db: SQLite.SQLiteDatabase | null = null;
export { batchReceiptChanges, subscribeToReceiptChanges };

export async function openDb() {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY NOT NULL,
      qrraw TEXT NOT NULL UNIQUE,
      organization TEXT NOT NULL,
      ticketDate TEXT NOT NULL,
      operationType INTEGER NOT NULL,
      totalSumRub REAL NOT NULL,
      sourceCode INTEGER NOT NULL
    );
  `);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      receiptId TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      priceRub REAL NOT NULL,
      quantity REAL NOT NULL,
      sumRub REAL NOT NULL,
      FOREIGN KEY (receiptId) REFERENCES receipts(id) ON DELETE CASCADE
    );
  `);
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_receipts_ticketDate ON receipts(ticketDate);",
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_receipt_items_receiptId ON receipt_items(receiptId);",
  );
  await db.runAsync(
    "UPDATE receipt_items SET category = ? WHERE category IN (?, ?)",
    ["прочее", "Прочее", "прочее"],
  );
  _db = db;
  return db;
}

function toIsoDate(value?: string) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function rublesFromKopeks(value?: number) {
  return typeof value === "number" ? value / 100 : 0;
}

function normalizeQrraw(qrraw: string): string {
  return qrraw
    .trim()
    .split("&")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("&");
}

export type ReceiptResponse = {
  receipt: Receipt;
  items: ReceiptItem[];
};

function createQrraw(receipt: ApiReceiptResponse): string | undefined {
  // example value is `2026-07-23T17:07:00`
  // should be        `20260723T1707
  const strDate = receipt.data?.json?.dateTime;
  if (!strDate) return;
  const ticketDate = strDate.replace(/[-:]/g, "").slice(0, 13);

  if (typeof receipt.data?.json?.totalSum !== "number") return;
  const sum = receipt.data?.json?.totalSum * 0.01;

  const fn = receipt.data?.json?.fiscalDriveNumber;
  const i = receipt.data?.json?.fiscalDocumentNumber;
  const fp = receipt.data?.json?.fiscalSign;

  return [
    `t=${ticketDate}`,
    `s=${sum}`,
    `fn=${fn}`,
    `i=${i}`,
    `fp=${fp}`,
    `n=1`,
  ].join("&");
}

export function normalizeReceiptResponse(
  response: ApiReceiptResponse,
): ReceiptResponse | null {
  const data = response.data?.json;
  if (!data || response.code !== 1) return null;

  // данные могут не содержать qrraw, но полностью валидны и имеют фискальные данные
  // TODO: сделать создание по данным из чека
  const qrraw: string | undefined =
    response.request?.qrraw || createQrraw(response);
  if (!qrraw) return null;

  // Providers use either ticketDate or dateTime for the fiscal purchase time.
  // Never replace a supplied purchase date with the scan time.
  const ticketDate: string = toIsoDate(data.ticketDate ?? data.dateTime);
  const operationType: number = data.operationType ?? 3;
  const sign: number = operationType === 2 || operationType === 4 ? -1 : 1;
  const totalSumRub: number = sign * rublesFromKopeks(data.totalSum);
  const organization: string = data.user?.trim() || "Неизвестно";

  const receipt: Receipt = {
    id: `${ticketDate}-${Math.random().toString(36).slice(2, 10)}`,
    qrraw,
    organization: organization?.trim(),
    ticketDate,
    operationType,
    totalSumRub,
    sourceCode: response.code,
  };

  const items: ReceiptItem[] = (data.items ?? []).map((item) => {
    const itemSumRub = sign * rublesFromKopeks(item.sum);
    return {
      receiptId: receipt.id,
      name: item.name?.trim() || "Без названия",
      category:
        normalizeServerCategory(item.category) ??
        detectCategory(item.name || ""),
      priceRub: sign * rublesFromKopeks(item.price),
      quantity: item.quantity ?? 1,
      sumRub: itemSumRub,
    };
  });

  return { receipt, items };
}

export async function saveReceipt(
  db: SQLite.SQLiteDatabase,
  receipt: Receipt,
  items: ReceiptItem[],
) {
  const normalizedQrraw = normalizeQrraw(receipt.qrraw);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const insert = await transaction.runAsync(
      `INSERT OR IGNORE INTO receipts (id, qrraw, organization, ticketDate, operationType, totalSumRub, sourceCode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        receipt.id,
        normalizedQrraw,
        receipt.organization,
        receipt.ticketDate,
        receipt.operationType,
        receipt.totalSumRub,
        receipt.sourceCode,
      ],
    );

    if (insert.changes === 0) return;

    await transaction.runAsync(
      `DELETE FROM receipt_items WHERE receiptId = ?`,
      [receipt.id],
    );

    const statement = await transaction.prepareAsync(
      `INSERT OR IGNORE INTO receipt_items (receiptId, name, category, priceRub, quantity, sumRub)
       VALUES ($receiptId, $name, $category, $priceRub, $quantity, $sumRub)`,
    );

    try {
      for (const item of items) {
        await statement.executeAsync({
          $receiptId: receipt.id,
          $name: item.name,
          $category: normalizeCategory(item.category),
          $priceRub: item.priceRub,
          $quantity: item.quantity,
          $sumRub: item.sumRub,
        });
      }
    } finally {
      await statement.finalizeAsync();
    }
  });
  notifyReceiptChange();
}

export async function loadReceipts(db: SQLite.SQLiteDatabase) {
  return db.getAllAsync<Receipt>(
    `SELECT id, qrraw, organization, ticketDate, operationType, totalSumRub, sourceCode
     FROM receipts
     ORDER BY datetime(ticketDate) DESC, id DESC`,
  );
}

export async function loadReceiptItems(
  db: SQLite.SQLiteDatabase,
  receiptId: string,
) {
  return db.getAllAsync<ReceiptItem>(
    `SELECT id, receiptId, name, category, priceRub, quantity, sumRub
     FROM receipt_items
     WHERE receiptId = ?
     ORDER BY sumRub DESC, name ASC`,
    [receiptId],
  );
}

export async function loadJoinedItems(db: SQLite.SQLiteDatabase) {
  return db.getAllAsync<ReceiptItem & { ticketDate: string }>(
    `SELECT ri.id, ri.receiptId, ri.name, ri.category, ri.priceRub, ri.quantity, ri.sumRub, r.ticketDate
     FROM receipt_items ri
     JOIN receipts r ON r.id = ri.receiptId
     ORDER BY datetime(r.ticketDate) DESC, ri.sumRub DESC`,
  );
}

export async function deleteReceipt(
  db: SQLite.SQLiteDatabase,
  receiptId: string,
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `DELETE FROM receipt_items WHERE receiptId = ?`,
      [receiptId],
    );
    await transaction.runAsync(`DELETE FROM receipts WHERE id = ?`, [
      receiptId,
    ]);
  });
  notifyReceiptChange();
}
