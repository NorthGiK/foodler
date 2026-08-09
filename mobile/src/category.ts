import { rule as ruleBread } from "./categories/bread";
import { rule as ruleConfectionery } from "./categories/confectionery";
import { rule as ruleDairy } from "./categories/dairy";
import { rule as ruleDrinks } from "./categories/drinks";
import { rule as ruleFish } from "./categories/fish";
import { rule as ruleFrozen } from "./categories/frozen";
import { rule as ruleFruits } from "./categories/fruits";
import { rule as ruleGrocery } from "./categories/grocery";
import { rule as ruleHousehold } from "./categories/household";
import { rule as ruleMeat } from "./categories/meat";
import { rule as ruleSausages } from "./categories/sausages";
import { rule as ruleSweets } from "./categories/sweets";
import { rule as ruleVegetables } from "./categories/vegetables";
import type { CategoryRule } from "./categories/types";

const RULES: CategoryRule[] = [
  ruleSausages,
  ruleMeat,
  ruleFish,
  ruleSweets,
  ruleConfectionery,
  ruleDairy,
  ruleBread,
  ruleVegetables,
  ruleFruits,
  ruleDrinks,
  ruleGrocery,
  ruleFrozen,
  ruleHousehold,
];

export const FALLBACK_CATEGORY = "прочее";

export function normalizeCategory(category: string | null | undefined): string {
  const normalized = category?.trim();
  if (
    !normalized ||
    normalized.toLocaleLowerCase("ru-RU") === FALLBACK_CATEGORY
  ) {
    return FALLBACK_CATEGORY;
  }
  return normalized;
}

const SERVER_CATEGORY_LABELS: Record<string, string> = {
  алкоголь: "Алкоголь",
  бакалея: "Бакалея",
  "бытовые товары": "Бытовые товары",
  "готовая еда": "Готовая еда",
  заморозка: "Замороженные продукты",
  кондитерские: "Кондитерские изделия",
  колбасы: "Колбасы",
  молочные: "Молочные продукты",
  мясо: "Мясо",
  напитки: "Напитки",
  овощи: "Овощи",
  прочее: FALLBACK_CATEGORY,
  рыба: "Рыба и морепродукты",
  сладости: "Сладости",
  соусы: "Соусы",
  снеки: "Снеки",
  фрукты: "Фрукты",
  хлеб: "Хлеб и выпечка",
  яйца: "Яйца",
};

export function normalizeServerCategory(
  category: string | null | undefined,
): string | null {
  if (!category) return null;
  return (
    SERVER_CATEGORY_LABELS[category.trim().toLocaleLowerCase("ru-RU")] ?? null
  );
}

export function detectCategory(name: string): string {
  const normalized = name.toLowerCase().replace(/[()\[\]{}.,;:!?"'`]/g, " ");
  const found = RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(normalized)),
  );
  if (found) return found.category;
  return FALLBACK_CATEGORY;
}
