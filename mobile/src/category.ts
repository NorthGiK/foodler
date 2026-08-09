const RULES: { category: string; patterns: RegExp[] }[] = [
  {
    category: 'Колбасы',
    patterns: [/колбас/i, /сервелат/i, /сосиск/i, /сардельк/i, /ветчин/i, /балык/i],
  },
  {
    category: 'Мясо',
    patterns: [/говядин/i, /свинин/i, /куриц/i, /индейк/i, /фарш/i, /мяс/i, /бедр/i, /бёдр/i],
  },
  {
    category: 'Рыба и морепродукты',
    patterns: [/рыб/i, /лосос/i, /форел/i, /скумбр/i, /кревет/i, /тунец/i],
  },
  {
    category: 'Молочные продукты',
    patterns: [/молок/i, /йогурт/i, /кефир/i, /творог/i, /сыр/i, /масло/i, /сливк/i],
  },
  {
    category: 'Хлеб и выпечка',
    patterns: [/хлеб/i, /батон/i, /булоч/i, /лаваш/i, /пирож/i, /выпеч/i],
  },
  {
    category: 'Овощи',
    patterns: [/огурц/i, /помид/i, /картоф/i, /морков/i, /лук/i, /капуст/i, /овощ/i, /зелень/i],
  },
  {
    category: 'Фрукты',
    patterns: [/яблок/i, /банан/i, /апельс/i, /груш/i, /виноград/i, /фрукт/i, /ягод/i],
  },
  {
    category: 'Напитки',
    patterns: [/вода/i, /сок/i, /морс/i, /чай/i, /кофе/i, /лимонад/i, /газиров/i, /напит/i],
  },
  {
    category: 'Бакалея',
    patterns: [/круп/i, /рис/i, /греч/i, /макарон/i, /мук/i, /сахар/i, /соль/i, /масл/i],
  },
  {
    category: 'Кондитерские изделия',
    patterns: [/шоколад/i, /конфет/i, /печен/i, /торт/i, /вафл/i, /мармел/i, /десерт/i],
  },
  {
    category: 'Замороженные продукты',
    patterns: [/заморож/i, /пельмен/i, /вареник/i, /морожен/i, /фри/i],
  },
  {
    category: 'Бытовая химия',
    patterns: [/порош/i, /средств/i, /гель/i, /шампун/i, /мыло/i, /моющ/i, /чистящ/i],
  },
];

export const FALLBACK_CATEGORY = "прочее";

export function normalizeCategory(category: string | null | undefined): string {
  const normalized = category?.trim();
  if (!normalized || normalized.toLocaleLowerCase("ru-RU") === FALLBACK_CATEGORY) {
    return FALLBACK_CATEGORY;
  }
  return normalized;
}

export function detectCategory(name: string): string {
  const normalized = name.toLowerCase().replace(/[()\[\]{}.,;:!?"'`]/g, ' ');
  const found = RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(normalized)));
  if (found) return found.category;
  return FALLBACK_CATEGORY;
}
