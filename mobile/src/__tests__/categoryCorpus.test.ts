import corpus from "../../../contracts/product-category-regression.json";
import { detectCategory, normalizeCategory } from "../category";

test("shared category regression corpus", () => {
  for (const row of corpus) expect(normalizeCategory(detectCategory(row.name))).toBe(normalizeCategory(row.category));
});
