import { normalizeCategory } from "../../category";
import type { ReceiptItem } from "../../types";

export type ReceiptCategoryHighlight = {
  category: string;
  totalRub: number;
};

/** Returns the three most expensive normalized categories in a receipt. */
export function getReceiptCategoryHighlights(
  items: readonly ReceiptItem[],
): ReceiptCategoryHighlight[] {
  const totals = new Map<string, number>();

  for (const item of items) {
    const category = normalizeCategory(item.category);
    totals.set(category, (totals.get(category) ?? 0) + item.sumRub);
  }

  return [...totals.entries()]
    .map(([category, totalRub]) => ({ category, totalRub }))
    .sort(
      (left, right) =>
        right.totalRub - left.totalRub ||
        left.category.localeCompare(right.category, "ru-RU"),
    )
    .slice(0, 3);
}
