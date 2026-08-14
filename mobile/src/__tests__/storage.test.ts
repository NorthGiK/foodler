import {
  normalizePersistedCategories,
  normalizeReceiptResponse,
} from "../storage";

describe("receipt date normalization", () => {
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
              gtin: "4601234567890",
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
