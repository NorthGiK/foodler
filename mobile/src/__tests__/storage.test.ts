import { normalizeReceiptResponse } from "../storage";

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
});
