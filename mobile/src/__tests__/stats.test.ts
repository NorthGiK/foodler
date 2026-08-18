import {
  buildCategoryExpenses,
  buildExpenseSeries,
  currentPeriodSelection,
  filterReceiptsBySelection,
  isFuturePeriod,
  shiftPeriod,
  startOfPeriod,
} from "../stats";
import type { Receipt, ReceiptItem } from "../types";

const receipts: Receipt[] = [
  {
    id: "august-1",
    qrraw: "qr-1",
    organization: "Магазин",
    ticketDate: "2026-08-10T10:30:00",
    operationType: 1,
    totalSumRub: 1000,
    sourceCode: 1,
  },
  {
    id: "august-2",
    qrraw: "qr-2",
    organization: "Магазин",
    ticketDate: "2026-08-11T18:30:00",
    operationType: 1,
    totalSumRub: 500,
    sourceCode: 1,
  },
  {
    id: "september-1",
    qrraw: "qr-3",
    organization: "Магазин",
    ticketDate: "2026-09-01T09:00:00",
    operationType: 1,
    totalSumRub: 750,
    sourceCode: 1,
  },
];

const items: ReceiptItem[] = [
  {
    receiptId: "august-1",
    name: "Хлеб",
    category: "Продукты",
    priceRub: 600,
    quantity: 1,
    sumRub: 600,
  },
  {
    receiptId: "august-1",
    name: "Молоко",
    category: "Молочные продукты",
    priceRub: 200,
    quantity: 1,
    sumRub: 200,
  },
];

describe("statistics calculations", () => {
  it("starts every selected granularity at the current period", () => {
    const now = new Date("2026-08-17T12:00:00");

    expect(currentPeriodSelection("year", now).anchor).toEqual(
      new Date("2026-01-01T00:00:00"),
    );
    expect(currentPeriodSelection("month", now).anchor).toEqual(
      new Date("2026-08-01T00:00:00"),
    );
    expect(currentPeriodSelection("week", now).anchor).toEqual(
      new Date("2026-08-17T00:00:00"),
    );
    expect(currentPeriodSelection("day", now).anchor).toEqual(
      new Date("2026-08-17T00:00:00"),
    );
  });

  it("filters receipts and builds category percentages for a selected month", () => {
    const selection = {
      period: "month" as const,
      anchor: new Date("2026-08-15T12:00:00"),
    };

    expect(filterReceiptsBySelection(receipts, selection)).toHaveLength(2);
    expect(buildCategoryExpenses(receipts, items, selection)).toEqual([
      { label: "Другое", value: 700, percentage: 47 },
      { label: "Продукты", value: 600, percentage: 40 },
      { label: "Молочные продукты", value: 200, percentage: 13 },
    ]);
  });

  it("builds a seven-day series for a week and preserves zero-value days", () => {
    const selection = {
      period: "week" as const,
      anchor: new Date("2026-08-10T12:00:00"),
    };
    const series = buildExpenseSeries(receipts, selection);

    expect(series).toHaveLength(7);
    expect(series.map((point) => point.value)).toEqual([
      1000, 500, 0, 0, 0, 0, 0,
    ]);
  });

  it("groups a year series by month instead of repeating the annual total", () => {
    const selection = {
      period: "year" as const,
      anchor: new Date("2026-08-15T12:00:00"),
    };

    expect(
      buildExpenseSeries(receipts, selection).map((point) => point.value),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 1500, 750, 0, 0, 0]);
  });

  it("does not allow navigation to a future period", () => {
    const now = new Date("2026-08-17T12:00:00");
    const currentMonth = {
      period: "month" as const,
      anchor: startOfPeriod(now, "month"),
    };
    const nextMonth = {
      period: "month" as const,
      anchor: shiftPeriod(currentMonth.anchor, "month", 1),
    };

    expect(isFuturePeriod(currentMonth, now)).toBe(false);
    expect(isFuturePeriod(nextMonth, now)).toBe(true);
  });
});
