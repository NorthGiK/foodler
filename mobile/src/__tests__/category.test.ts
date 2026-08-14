import {
  detectCategory,
  FALLBACK_CATEGORY,
  normalizeCategory,
  normalizeServerCategory,
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

  it("normalizes server category names", () => {
    expect(normalizeServerCategory("сладости")).toBe("Сладости");
    expect(normalizeServerCategory("прочее")).toBe(FALLBACK_CATEGORY);
    expect(normalizeServerCategory("unknown")).toBeNull();
  });

  it("merges legacy labels regardless of case", () => {
    expect(normalizeCategory("МОЛОЧНЫЕ ПРОДУКТЫ")).toBe("Молочные продукты");
    expect(normalizeCategory("молоченые")).toBe("Молочные продукты");
    expect(normalizeCategory("ФРУКТЫ")).toBe("Фрукты");
    expect(normalizeServerCategory("ФРУКТЫ")).toBe("Фрукты");
  });

  it.each([
    ["ЧЕРЕШНЯ 1кг", "Фрукты"],
    ["Нектарин 1кг", "Фрукты"],
    ["KITEKAT Корм д/кош желе курица 85г", FALLBACK_CATEGORY],
    ["МАГНИТ Салфетки бум 2сл 50шт", "Бытовая химия"],
    ["Сыр Пармезан Гранд 45%", "Молочные продукты"],
    ["Крупа гречневая ядрица", "Бакалея"],
    ["Фасоль продовольственная 500г", "Бакалея"],
    ["Рис длиннозерный 800г", "Бакалея"],
  ])("classifies %s as %s", (name, expected) => {
    expect(detectCategory(name)).toBe(expected);
  });
});
