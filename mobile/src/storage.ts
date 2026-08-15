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
import {
  RECEIPT_DATABASE_SETUP,
  RECEIPT_QUERIES,
} from "./database/receiptQueries";
import { ApiReceiptResponse, Receipt, ReceiptItem } from "./types";

const DB_NAME = "food_spend_tracker.db";

let _db: SQLite.SQLiteDatabase | null = null;
export { batchReceiptChanges, subscribeToReceiptChanges };

export function normalizeProductName(name: string): string {
  return name.trim().toLocaleLowerCase("ru-RU");
}

export async function normalizePersistedCategories(db: SQLite.SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const rows = await transaction.getAllAsync<{ category: string }>(
      RECEIPT_QUERIES.selectReceiptItemCategories,
    );
    for (const row of rows) {
      const normalized = normalizeCategory(row.category);
      if (normalized !== row.category) {
        await transaction.runAsync(RECEIPT_QUERIES.updateReceiptItemCategory, [
          normalized,
          row.category,
        ]);
      }
    }
  });
}

export async function openDb() {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(RECEIPT_DATABASE_SETUP.enableWal);
  await db.execAsync(RECEIPT_DATABASE_SETUP.createReceipts);
  await db.execAsync(RECEIPT_DATABASE_SETUP.createReceiptItems);
  await db.execAsync(RECEIPT_DATABASE_SETUP.createReceiptCategoryOverrides);
  await ensureReceiptItemCategoryColumns(db);
  await db.execAsync(RECEIPT_DATABASE_SETUP.createReceiptsDateIndex);
  await db.execAsync(RECEIPT_DATABASE_SETUP.createReceiptItemsReceiptIndex);
  await normalizePersistedCategories(db);
  _db = db;
  return db;
}

async function ensureReceiptItemCategoryColumns(db: SQLite.SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(receipt_items)",
  );
  const existing = new Set(columns.map((column) => column.name));
  const additions: [string, string][] = [
    ["categorySource", "TEXT"],
    ["categoryConfidence", "REAL"],
    ["categoryTaxonomyVersion", "TEXT"],
    ["categoryModelVersion", "TEXT"],
  ];
  for (const [name, type] of additions) {
    if (!existing.has(name))
      await db.execAsync(
        `ALTER TABLE receipt_items ADD COLUMN ${name} ${type}`,
      );
  }
}

function toIsoDate(value?: string) {
  // Date-only values are fiscal calendar dates, not instants in an arbitrary
  // timezone. Preserve them verbatim for rendering and server sync.
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
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

function stableReceiptId(qrraw: string): string {
  let hash = 2166136261;
  for (let index = 0; index < qrraw.length; index += 1) {
    hash ^= qrraw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `qr:${(hash >>> 0).toString(16)}`;
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
    id: response.receiptId || stableReceiptId(normalizeQrraw(qrraw)),
    qrraw,
    organization: organization?.trim(),
    ticketDate,
    operationType,
    totalSumRub,
    sourceCode: response.code,
  };

  const items: ReceiptItem[] = (data.items ?? []).map((item) => {
    const quantity = item.quantity ?? 1;
    const priceRub = rublesFromKopeks(item.price);
    const itemSumRub =
      sign * rublesFromKopeks(item.sum ?? (item.price ?? 0) * quantity);
    return {
      receiptId: receipt.id,
      name: item.name?.trim() || "Без названия",
      category:
        normalizeServerCategory(item.category) ??
        detectCategory(item.name || ""),
      categorySource: item.category_source,
      categoryConfidence: item.category_confidence,
      categoryTaxonomyVersion: item.category_taxonomy_version,
      categoryModelVersion: item.category_model_version,
      priceRub: sign * priceRub,
      quantity,
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
    const insert = await transaction.runAsync(RECEIPT_QUERIES.insertReceipt, [
      receipt.id,
      normalizedQrraw,
      receipt.organization,
      receipt.ticketDate,
      receipt.operationType,
      receipt.totalSumRub,
      receipt.sourceCode,
    ]);

    if (insert.changes === 0) return;

    await transaction.runAsync(RECEIPT_QUERIES.deleteReceiptItems, [
      receipt.id,
    ]);

    const statement = await transaction.prepareAsync(
      RECEIPT_QUERIES.insertReceiptItem,
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
          $categorySource: item.categorySource ?? null,
          $categoryConfidence: item.categoryConfidence ?? null,
          $categoryTaxonomyVersion: item.categoryTaxonomyVersion ?? null,
          $categoryModelVersion: item.categoryModelVersion ?? null,
        });
      }
    } finally {
      await statement.finalizeAsync();
    }
  });
  notifyReceiptChange();
}

export async function loadReceipts(db: SQLite.SQLiteDatabase) {
  return db.getAllAsync<Receipt>(RECEIPT_QUERIES.selectReceipts);
}

export async function loadReceiptItems(
  db: SQLite.SQLiteDatabase,
  receiptId: string,
) {
  const items = await db.getAllAsync<ReceiptItem>(
    RECEIPT_QUERIES.selectReceiptItems,
    [receiptId],
  );
  return applyLocalCategoryOverrides(db, items);
}

type CategoryOverride = { productNameKey: string; category: string };

async function applyLocalCategoryOverrides<T extends ReceiptItem>(
  db: SQLite.SQLiteDatabase,
  items: T[],
): Promise<T[]> {
  if (items.length === 0) return items;
  const overrides = await db.getAllAsync<CategoryOverride>(
    RECEIPT_QUERIES.selectReceiptCategoryOverrides,
  );
  const categoriesByName = new Map(
    overrides.map(({ productNameKey, category }) => [productNameKey, category]),
  );
  return items.map((item) => {
    const category = categoriesByName.get(normalizeProductName(item.name));
    return category === undefined ? item : { ...item, category };
  });
}

export async function saveLocalCategoryOverride(
  db: SQLite.SQLiteDatabase,
  productName: string,
  category: string,
) {
  const productNameKey = normalizeProductName(productName);
  const trimmedCategory = category.trim();
  if (!productNameKey || !trimmedCategory) {
    throw new Error("Product name and category are required");
  }
  await db.runAsync(RECEIPT_QUERIES.upsertReceiptCategoryOverride, [
    productNameKey,
    trimmedCategory,
  ]);
  notifyReceiptChange();
}

export async function hasLocalCategoryOverride(
  db: SQLite.SQLiteDatabase,
  productName: string,
) {
  const result = await db.getFirstAsync<{ category: string }>(
    RECEIPT_QUERIES.selectReceiptCategoryOverride,
    [normalizeProductName(productName)],
  );
  return result !== null;
}

export async function removeLocalCategoryOverride(
  db: SQLite.SQLiteDatabase,
  productName: string,
) {
  await db.runAsync(RECEIPT_QUERIES.deleteReceiptCategoryOverride, [
    normalizeProductName(productName),
  ]);
  notifyReceiptChange();
}

export async function applyServerItemCategories(
  db: SQLite.SQLiteDatabase,
  receiptId: string,
  items: ReceiptItem[],
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const item of items) {
      await transaction.runAsync(
        RECEIPT_QUERIES.updateReceiptItemServerCategory,
        [
          normalizeCategory(item.category),
          item.categorySource ?? null,
          item.categoryConfidence ?? null,
          item.categoryTaxonomyVersion ?? null,
          item.categoryModelVersion ?? null,
          receiptId,
          item.name,
          item.priceRub,
          item.quantity,
        ],
      );
    }
  });
  notifyReceiptChange();
}

export async function loadJoinedItems(db: SQLite.SQLiteDatabase) {
  const items = await db.getAllAsync<ReceiptItem & { ticketDate: string }>(
    RECEIPT_QUERIES.selectJoinedItems,
  );
  return applyLocalCategoryOverrides(db, items);
}

export async function deleteReceipt(
  db: SQLite.SQLiteDatabase,
  receiptId: string,
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(RECEIPT_QUERIES.deleteReceiptItems, [receiptId]);
    await transaction.runAsync(RECEIPT_QUERIES.deleteReceipts, [receiptId]);
  });
  notifyReceiptChange();
}
