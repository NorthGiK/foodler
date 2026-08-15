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
import { rule as rulePet } from "./categories/pet";
import { rule as ruleSausages } from "./categories/sausages";
import { rule as ruleSweets } from "./categories/sweets";
import { rule as ruleVegetables } from "./categories/vegetables";
import { rule as ruleAlcohol } from "./categories/alcohol";
import { eggRule, readyRule, snackRule } from "./categories/receipt";
import { rule as ruleSauces } from "./categories/sauces";
import type { CategoryRule } from "./categories/types";

const RULES: CategoryRule[] = [
  ruleAlcohol,
  eggRule,
  readyRule,
  snackRule,
  ruleSauces,
  rulePet,
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

const CATEGORY_LABELS: Record<string, string> = {
  алкоголь: "Алкоголь",
  бакалея: "Бакалея",
  "бытовые товары": "Бытовые товары",
  "бытовая химия": "Бытовые товары",
  "готовая еда": "Готовая еда",
  заморозка: "Замороженные продукты",
  "замороженные продукты": "Замороженные продукты",
  кондитерские: "Кондитерские изделия",
  "кондитерские изделия": "Кондитерские изделия",
  колбасы: "Колбасы",
  молочные: "Молочные продукты",
  "молочные продукты": "Молочные продукты",
  молоченые: "Молочные продукты",
  мясо: "Мясо",
  напитки: "Напитки",
  овощи: "Овощи",
  прочее: FALLBACK_CATEGORY,
  рыба: "Рыба и морепродукты",
  "рыба и морепродукты": "Рыба и морепродукты",
  сладости: "Сладости",
  соусы: "Соусы",
  снеки: "Снеки",
  фрукты: "Фрукты",
  хлеб: "Хлеб и выпечка",
  "хлеб и выпечка": "Хлеб и выпечка",
  яйца: "Яйца",
};

export function normalizeCategory(category: string | null | undefined): string {
  const normalized = category?.trim().toLocaleLowerCase("ru-RU");
  if (!normalized) return FALLBACK_CATEGORY;
  return CATEGORY_LABELS[normalized] ?? normalized;
}

export function normalizeServerCategory(
  category: string | null | undefined,
): string | null {
  if (!category) return null;
  const key = category.trim().toLocaleLowerCase("ru-RU");
  return CATEGORY_LABELS[key] ?? null;
}

export function detectCategory(name: string): string {
  const normalized = name.toLowerCase().replace(/[()\[\]{}.,;:!?"'`]/g, " ");
  const found = RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(normalized)),
  );
  if (found) return found.category;
  return FALLBACK_CATEGORY;
}
