import { getReceiptCategoryHighlights } from "../receiptHighlights";
import type { ReceiptItem } from "../../../types";

function item(category: string, sumRub: number, name = category): ReceiptItem {
  return {
    receiptId: "receipt-1",
    name,
    category,
    priceRub: sumRub,
    quantity: 1,
    sumRub,
  };
}

describe("getReceiptCategoryHighlights", () => {
  it("sums normalized categories and returns the three largest", () => {
    expect(
      getReceiptCategoryHighlights([
        item("Молочные продукты", 120),
        item("молоченые", 80, "кефир"),
        item("Напитки", 150),
        item("Овощи", 140),
        item("Фрукты", 100),
      ]),
    ).toEqual([
      { category: "Молочные продукты", totalRub: 200 },
      { category: "Напитки", totalRub: 150 },
      { category: "Овощи", totalRub: 140 },
    ]);
  });

  it("uses a stable category-name order for equal totals", () => {
    expect(
      getReceiptCategoryHighlights([item("Напитки", 100), item("Овощи", 100)]),
    ).toEqual([
      { category: "Напитки", totalRub: 100 },
      { category: "Овощи", totalRub: 100 },
    ]);
  });

  it("returns no highlight for a receipt without positions", () => {
    expect(getReceiptCategoryHighlights([])).toEqual([]);
  });
});
