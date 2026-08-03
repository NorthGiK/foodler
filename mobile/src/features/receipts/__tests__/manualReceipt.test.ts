import {
  buildManualReceipt,
  calculateManualReceiptTotal,
  validateManualReceipt,
  type ManualReceiptDraft,
} from "../manualReceipt";

const validDraft: ManualReceiptDraft = {
  organization: " Магазин ",
  date: "2026-08-01",
  items: [
    {
      id: "milk",
      name: " Молоко ",
      priceRub: "99,90",
      quantity: "2",
    },
  ],
};

describe("manual receipt", () => {
  it("uses the selected date and normalizes monetary values", () => {
    const result = buildManualReceipt(
      validDraft,
      new Date("2026-08-02T10:00:00.000Z"),
      "fixed",
    );

    expect(result.receipt.id).toBe("manual:1785664800000:fixed");
    expect(result.receipt.organization).toBe("Магазин");
    expect(result.receipt.ticketDate.slice(0, 10)).toBe("2026-08-01");
    expect(result.receipt.totalSumRub).toBe(199.8);
    expect(result.items[0]).toMatchObject({
      receiptId: result.receipt.id,
      name: "Молоко",
      priceRub: 99.9,
      quantity: 2,
      sumRub: 199.8,
    });
  });

  it("rejects impossible dates and non-positive item values", () => {
    const errors = validateManualReceipt({
      organization: "",
      date: "2026-02-30",
      items: [
        {
          id: "bad",
          name: "",
          priceRub: "0",
          quantity: "-1",
        },
      ],
    });

    expect(errors).toEqual({
      organization: true,
      date: true,
      bad: true,
      bad_price: true,
      bad_quantity: true,
    });
  });

  it("rounds each line and the final total to kopecks", () => {
    expect(
      calculateManualReceiptTotal([
        { id: "1", name: "A", priceRub: "10.01", quantity: "0.333" },
        { id: "2", name: "B", priceRub: "1.005", quantity: "1" },
      ]),
    ).toBe(4.34);
  });
});
