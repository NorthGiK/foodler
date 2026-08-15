export const RECEIPT_DATABASE_SETUP = {
  enableWal: "PRAGMA journal_mode = WAL;",
  createReceipts: `
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY NOT NULL,
      qrraw TEXT NOT NULL UNIQUE,
      organization TEXT NOT NULL,
      ticketDate TEXT NOT NULL,
      operationType INTEGER NOT NULL,
      totalSumRub REAL NOT NULL,
      sourceCode INTEGER NOT NULL
    );
  `,
  createReceiptItems: `
    CREATE TABLE IF NOT EXISTS receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      receiptId TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      priceRub REAL NOT NULL,
      quantity REAL NOT NULL,
      sumRub REAL NOT NULL,
      categorySource TEXT,
      categoryConfidence REAL,
      categoryTaxonomyVersion TEXT,
      categoryModelVersion TEXT,
      FOREIGN KEY (receiptId) REFERENCES receipts(id) ON DELETE CASCADE
    );
  `,
  createReceiptCategoryOverrides: `
    CREATE TABLE IF NOT EXISTS receipt_category_overrides (
      productNameKey TEXT PRIMARY KEY NOT NULL,
      category TEXT NOT NULL
    );
  `,
  createReceiptsDateIndex:
    "CREATE INDEX IF NOT EXISTS idx_receipts_ticketDate ON receipts(ticketDate);",
  createReceiptItemsReceiptIndex:
    "CREATE INDEX IF NOT EXISTS idx_receipt_items_receiptId ON receipt_items(receiptId);",
} as const;

export const RECEIPT_QUERIES = {
  insertReceipt: `
    INSERT OR IGNORE INTO receipts (id, qrraw, organization, ticketDate, operationType, totalSumRub, sourceCode)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  deleteReceiptItems: "DELETE FROM receipt_items WHERE receiptId = ?",
  insertReceiptItem: `
    INSERT OR IGNORE INTO receipt_items (receiptId, name, category, priceRub, quantity, sumRub, categorySource, categoryConfidence, categoryTaxonomyVersion, categoryModelVersion)
    VALUES ($receiptId, $name, $category, $priceRub, $quantity, $sumRub, $categorySource, $categoryConfidence, $categoryTaxonomyVersion, $categoryModelVersion)
  `,
  selectReceipts: `
    SELECT id, qrraw, organization, ticketDate, operationType, totalSumRub, sourceCode
    FROM receipts
    ORDER BY datetime(ticketDate) DESC, id DESC
  `,
  selectReceiptItems: `
    SELECT id, receiptId, name, category, priceRub, quantity, sumRub, categorySource, categoryConfidence, categoryTaxonomyVersion, categoryModelVersion
    FROM receipt_items
    WHERE receiptId = ?
    ORDER BY sumRub DESC, name ASC
  `,
  selectJoinedItems: `
    SELECT ri.id, ri.receiptId, ri.name, ri.category, ri.priceRub, ri.quantity, ri.sumRub, ri.categorySource, ri.categoryConfidence, ri.categoryTaxonomyVersion, ri.categoryModelVersion, r.ticketDate
    FROM receipt_items ri
    JOIN receipts r ON r.id = ri.receiptId
    ORDER BY datetime(r.ticketDate) DESC, ri.sumRub DESC
  `,
  deleteReceipts: "DELETE FROM receipts WHERE id = ?",
  selectReceiptItemCategories:
    "SELECT DISTINCT category FROM receipt_items WHERE category IS NOT NULL",
  updateReceiptItemCategory:
    "UPDATE receipt_items SET category = ? WHERE category = ?",
  updateReceiptItemServerCategory: `
    UPDATE receipt_items
    SET category = ?, categorySource = ?, categoryConfidence = ?, categoryTaxonomyVersion = ?, categoryModelVersion = ?
    WHERE receiptId = ? AND name = ? AND priceRub = ? AND quantity = ?
  `,
  selectReceiptCategoryOverrides:
    "SELECT productNameKey, category FROM receipt_category_overrides",
  selectReceiptCategoryOverride:
    "SELECT category FROM receipt_category_overrides WHERE productNameKey = ?",
  upsertReceiptCategoryOverride: `
    INSERT INTO receipt_category_overrides (productNameKey, category)
    VALUES (?, ?)
    ON CONFLICT(productNameKey) DO UPDATE SET category = excluded.category
  `,
  deleteReceiptCategoryOverride:
    "DELETE FROM receipt_category_overrides WHERE productNameKey = ?",
} as const;
