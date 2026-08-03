import * as SQLite from "expo-sqlite";
import { detectCategory } from "./category";
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
      qrraw TEXT NOT NULL,
      organization TEXT NOT NULL,
      ticketDate TEXT NOT NULL,
      operationType INTEGER NOT NULL,
      totalSumRub REAL NOT NULL,
      sourceCode INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
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

export type ReceiptResponse = {
  receipt: Receipt;
  items: ReceiptItem[];
};

export function normalizeReceiptResponse(
  response: ApiReceiptResponse,
): ReceiptResponse | null {
  const data = response.data?.json;
  if (!data || response.code !== 1) return null;

  const qrraw = response.request?.qrraw;
  if (!qrraw) return null;

  const ticketDate = toIsoDate(data.ticketDate);
  const operationType = data.operationType ?? 3;
  const sign = operationType === 2 || operationType === 4 ? -1 : 1;
  const totalSumRub = sign * rublesFromKopeks(data.totalSum);

  const receipt: Receipt = {
    id: `${ticketDate}-${Math.random().toString(36).slice(2, 10)}`,
    qrraw,
    organization: data.user?.trim() || "Неизвестная организация",
    ticketDate,
    operationType,
    totalSumRub,
    sourceCode: response.code,
    createdAt: Date.now(),
  };

  const items: ReceiptItem[] = (data.items ?? []).map((item) => {
    const itemSumRub = sign * rublesFromKopeks(item.sum);
    return {
      receiptId: receipt.id,
      name: item.name?.trim() || "Без названия",
      category: detectCategory(item.name || ""),
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
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT OR REPLACE INTO receipts (id, qrraw, organization, ticketDate, operationType, totalSumRub, sourceCode, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        receipt.id,
        receipt.qrraw,
        receipt.organization,
        receipt.ticketDate,
        receipt.operationType,
        receipt.totalSumRub,
        receipt.sourceCode,
        receipt.createdAt,
      ],
    );

    await transaction.runAsync(
      `DELETE FROM receipt_items WHERE receiptId = ?`,
      [receipt.id],
    );

    const statement = await transaction.prepareAsync(
      `INSERT INTO receipt_items (receiptId, name, category, priceRub, quantity, sumRub)
       VALUES ($receiptId, $name, $category, $priceRub, $quantity, $sumRub)`,
    );

    try {
      for (const item of items) {
        await statement.executeAsync({
          $receiptId: receipt.id,
          $name: item.name,
          $category: item.category,
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
    `SELECT id, qrraw, organization, ticketDate, operationType, totalSumRub, sourceCode, createdAt
     FROM receipts
     ORDER BY datetime(ticketDate) DESC, createdAt DESC`,
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
