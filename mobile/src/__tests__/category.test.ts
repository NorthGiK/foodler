import {
  detectCategory,
  FALLBACK_CATEGORY,
  normalizeCategory,
} from "../category";

describe("product categories", () => {
  it("uses one canonical fallback category", () => {
    expect(detectCategory("неизвестный товар")).toBe(FALLBACK_CATEGORY);
    expect(normalizeCategory("Прочее")).toBe(FALLBACK_CATEGORY);
    expect(normalizeCategory("прочее")).toBe(FALLBACK_CATEGORY);
    expect(normalizeCategory(undefined)).toBe(FALLBACK_CATEGORY);
  });

  it("classifies sweets separately from other confectionery", () => {
    expect(detectCategory("Шоколад молочный")).toBe("Сладости");
    expect(detectCategory("Печенье овсяное")).toBe("Кондитерские изделия");
  });
});
