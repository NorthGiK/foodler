import {
  applyServerItemCategories,
  hasLocalCategoryOverride,
  loadJoinedItems,
  loadReceiptItems,
  normalizePersistedCategories,
  normalizeReceiptResponse,
  normalizeProductName,
  removeLocalCategoryOverride,
  saveLocalCategoryOverride,
} from "../storage";

describe("receipt date normalization", () => {
  it("keeps the stable receipt ID returned by the server", () => {
    const result = normalizeReceiptResponse({
      code: 1,
      receiptId: "server-receipt-1",
      request: { qrraw: "t=20260101T1200&s=10&fn=1&i=2&fp=3" },
      data: { json: { ticketDate: "2026-01-01", totalSum: 1000, items: [] } },
    });
    expect(result?.receipt.id).toBe("server-receipt-1");
  });

  it("uses the fiscal dateTime when ticketDate is absent", () => {
    const result = normalizeReceiptResponse({
      code: 1,
      request: { qrraw: "t=20260806T1216&s=100" },
      data: {
        json: {
          dateTime: "2026-08-06T12:16:32+00:00",
          totalSum: 10000,
          items: [],
        },
      },
    });

    expect(result?.receipt.ticketDate).toBe("2026-08-06T12:16:32.000Z");
  });

  it("uses a canonical category returned by the backend", () => {
    const result = normalizeReceiptResponse({
      code: 1,
      request: { qrraw: "t=20260806T1216&s=100" },
      data: {
        json: {
          dateTime: "2026-08-06T12:16:32+00:00",
          totalSum: 10000,
          items: [
            {
              name: "Неочевидное товарное название",
              price: 10000,
              sum: 10000,
              quantity: 1,
              gtin: "4601234567893",
              category: "молочные",
            },
          ],
        },
      },
    });

    expect(result?.items[0]?.category).toBe("Молочные продукты");
  });
});

describe("persisted category normalization", () => {
  it("converges changed distinct categories in one exclusive transaction", async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (callback) =>
        callback({
          getAllAsync: jest
            .fn()
            .mockResolvedValue([
              { category: "фрукты" },
              { category: "Фрукты" },
              { category: "молоченые" },
              { category: "Молочные продукты" },
            ]),
          runAsync,
        }),
      ),
    };

    await normalizePersistedCategories(db as never);

    expect(runAsync).toHaveBeenCalledTimes(2);
    expect(runAsync).toHaveBeenNthCalledWith(1, expect.any(String), [
      "Фрукты",
      "фрукты",
    ]);
    expect(runAsync).toHaveBeenNthCalledWith(2, expect.any(String), [
      "Молочные продукты",
      "молоченые",
    ]);
    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  });
});

describe("local receipt category overrides", () => {
  const milkItem = {
    id: 1,
    receiptId: "receipt-1",
    name: "  МОЛОКО  ",
    category: "Молочные продукты",
    priceRub: 100,
    quantity: 1,
    sumRub: 100,
  };

  it("uses one case-insensitive rule for receipt history and future items", async () => {
    const db = {
      getAllAsync: jest
        .fn()
        .mockResolvedValueOnce([milkItem])
        .mockResolvedValueOnce([
          { productNameKey: "молоко", category: "Напитки" },
        ])
        .mockResolvedValueOnce([
          { ...milkItem, receiptId: "receipt-2", name: "молоко" },
        ])
        .mockResolvedValueOnce([
          { productNameKey: "молоко", category: "Напитки" },
        ]),
    };

    await expect(loadReceiptItems(db as never, "receipt-1")).resolves.toEqual([
      expect.objectContaining({ category: "Напитки" }),
    ]);
    await expect(loadJoinedItems(db as never)).resolves.toEqual([
      expect.objectContaining({ category: "Напитки", receiptId: "receipt-2" }),
    ]);
    expect(normalizeProductName("  МОЛОКО  ")).toBe("молоко");
  });

  it("stores trimmed custom text and reset exposes the saved automatic category", async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = {
      runAsync,
      getFirstAsync: jest
        .fn()
        .mockResolvedValue({ category: "Детское питание" }),
    };

    await saveLocalCategoryOverride(
      db as never,
      " Молоко ",
      " Детское питание ",
    );
    await expect(hasLocalCategoryOverride(db as never, "молоко")).resolves.toBe(
      true,
    );
    await removeLocalCategoryOverride(db as never, "МОЛОКО");

    expect(runAsync).toHaveBeenNthCalledWith(1, expect.any(String), [
      "молоко",
      "Детское питание",
    ]);
    expect(runAsync).toHaveBeenNthCalledWith(2, expect.any(String), ["молоко"]);
  });

  it("keeps the server category update in base storage while the local rule is read separately", async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (callback) =>
        callback({ runAsync }),
      ),
    };

    await applyServerItemCategories(db as never, "receipt-1", [
      { ...milkItem, category: "Напитки" },
    ]);

    expect(runAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["Напитки", "receipt-1", "  МОЛОКО  "]),
    );
  });
});
