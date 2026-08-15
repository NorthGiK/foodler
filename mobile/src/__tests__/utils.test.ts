import { buildAllTimeSeries, fmtDate, groupReceiptItems } from "../utils";
import type { Receipt, ReceiptItem } from "../types";

function receipt(id: string, ticketDate: string, totalSumRub: number): Receipt {
  return {
    id,
    qrraw: id,
    organization: "Магазин",
    ticketDate,
    operationType: 3,
    totalSumRub,
    sourceCode: 1,
  };
}

describe("buildAllTimeSeries", () => {
  it("renders a date-only fiscal value without inventing a time", () => {
    expect(fmtDate("2026-08-15")).toBe("15.08.2026");
  });

  it("aggregates each receipt once and keeps empty periods", () => {
    const points = buildAllTimeSeries(
      [
        receipt("1", "2026-07-30T10:00:00.000Z", 10),
        receipt("2", "2026-07-30T12:00:00.000Z", 20),
        receipt("3", "2026-08-01T12:00:00.000Z", 5),
      ],
      "day",
    );

    const byDate = new Map(
      points.map((point) => [
        [
          point.date.getFullYear(),
          String(point.date.getMonth() + 1).padStart(2, "0"),
          String(point.date.getDate()).padStart(2, "0"),
        ].join("-"),
        point.value,
      ]),
    );
    expect(byDate.get("2026-07-30")).toBe(30);
    expect(byDate.get("2026-07-31")).toBe(0);
    expect(byDate.get("2026-08-01")).toBe(5);
  });
});

describe("groupReceiptItems", () => {
  const item = (
    id: number,
    name: string,
    priceRub: number,
    quantity: number,
    sumRub: number,
  ): ReceiptItem => ({
    id,
    receiptId: "receipt-1",
    name,
    category: "Молочные продукты",
    priceRub,
    quantity,
    sumRub,
  });

  it("combines equal product names at the same price", () => {
    const grouped = groupReceiptItems([
      item(1, "Молоко Саратовское", 134, 1, 134),
      item(2, "Молоко Саратовское", 134, 1, 134),
    ]);

    expect(grouped).toEqual([
      expect.objectContaining({
        name: "Молоко Саратовское",
        priceRub: 134,
        quantity: 2,
        sumRub: 268,
      }),
    ]);
  });

  it("compares names case-insensitively but keeps different prices separate", () => {
    const grouped = groupReceiptItems([
      item(1, " Молоко Саратовское ", 134, 1, 134),
      item(2, "молоко саратовское", 134, 0.5, 67),
      item(3, "Молоко Саратовское", 135, 1, 135),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toEqual(
      expect.objectContaining({ quantity: 1.5, sumRub: 201 }),
    );
    expect(grouped[1]).toEqual(
      expect.objectContaining({ priceRub: 135, quantity: 1, sumRub: 135 }),
    );
  });
});
