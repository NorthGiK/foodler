import { detectCategory, normalizeServerCategory } from "../category";

describe("product categories", () => {
  it.each([
    ["ЧЕРЕШНЯ 1кг", "Фрукты"],
    ["МАГНИТ Салфетки бум 2сл 50шт", "Бытовые товары"],
    ["Сыр Пармезан Гранд 45%", "Молочные продукты"],
    ["Крупа гречневая ядрица", "Бакалея"],
    ["Фасоль продовольственная 500г", "Бакалея"],
    ["Рис длиннозерный 800г", "Бакалея"],
  ])("classifies %s as %s", (name, expected) => {
    expect(detectCategory(name)).toBe(expected);
  });

  it("rejects unknown server category values", () => {
    expect(normalizeServerCategory("несуществующая")).toBeNull();
  });
});
