import { buildAllTimeSeries } from "../utils";
import type { Receipt } from "../types";

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
