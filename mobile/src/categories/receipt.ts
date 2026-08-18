import type { CategoryRule } from "./types";

export const eggRule: CategoryRule = { category: "Яйца", patterns: [/яйц/i] };
export const snackRule: CategoryRule = {
  category: "Снеки",
  patterns: [/чипс/i, /снек/i, /крекер/i, /попкорн/i, /семечк/i],
};
export const readyRule: CategoryRule = {
  category: "Готовая еда",
  patterns: [/пицц/i, /суши/i, /ролл/i, /бургер/i, /сэндвич/i, /готов.*блюд/i],
};
