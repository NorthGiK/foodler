export type AiActionType =
  | "analysis"
  | "save_money"
  | "health"
  | "recipe"
  | "cart"
  | "ingredients"
  | "habits"
  | "diet"
  | "ask";

export interface AiSectionText {
  type: "text";
  title: string;
  text: string;
}

export interface AiSectionScore {
  type: "score";
  title: string;
  value: number;
  max?: number;
}

export interface AiSectionList {
  type: "list";
  title: string;
  items: string[];
}

export interface AiSectionProducts {
  type: "products";
  title: string;
  products: {
    name: string;
    reason: string;
    price?: number;
  }[];
}

export interface AiSectionChart {
  type: "chart";
  title: string;
  labels: string[];
  values: number[];
  kind: "bar" | "line";
}

export type AiSection =
  | AiSectionText
  | AiSectionScore
  | AiSectionList
  | AiSectionProducts
  | AiSectionChart;

export interface AiResult {
  id: string;
  type: AiActionType;
  title: string;
  summary: string;
  sections: AiSection[];
}

export interface AiReportSnapshot {
  receiptCount: number;
  periodFrom?: string;
  periodTo?: string;
  totalSpent?: number;
  receiptIds: string[];
}

export interface AiReport {
  id: string;
  action: AiActionType;
  createdAt: number;
  snapshot: AiReportSnapshot;
  response: AiResult;
  pinned: boolean;
}

// Маппинг локальных action-ов на серверные
export const ACTION_TO_SERVER: Record<AiActionType, string> = {
  analysis: "overall-analysis",
  save_money: "save-money",
  health: "healthy-food",
  recipe: "recipes",
  cart: "shopping-cart",
  ingredients: "ingredients",
  habits: "habits",
  diet: "diet",
  ask: "ask",
};

// Промпты для каждого типа действия
export const ACTION_LABELS: Record<AiActionType, string> = {
  analysis: "Общий анализ покупок",
  save_money: "Как сэкономить",
  health: "Полезность покупок",
  recipe: "Что приготовить",
  cart: "Корзина продуктов",
  ingredients: "Состав продуктов",
  habits: "Привычки питания",
  diet: "Рацион питания",
  ask: "Задать вопрос",
};

export const ACTION_PROMPTS: Record<AiActionType, string> = {
  analysis: `Проанализируй покупки пользователя и дай персональные рекомендации.
Оцени структуру расходов, категории товаров, сезонность.
Верни результат в формате JSON с секциями.`,

  save_money: `Проанализируй покупки и найди возможности для экономии.
Посоветуй более дешёвые альтернативы, отказы от импульсивных покупок,
оптимальные размеры упаковок.`,

  health: `Оцени полезность купленных продуктов.
Проанализируй баланс питания, соотношение обработанных и свежих продуктов.
Дай рекомендации по улучшению рациона.`,

  recipe: `На основе купленных продуктов предложи рецепты.
Учитывай сезонные продукты и то, что уже есть дома.
Предложи разнообразные блюда.`,

  cart: `Составь оптимальную корзину продуктов на неделю.
Учти предпочтения пользователя, бюджет и баланс питания.
Раздели на категории товаров.`,

  ingredients: `Проанализируй состав продуктов из чеков.
Обрати внимание на добавки, консерванты, соотношение БЖУ.
Выдели полезные и сомнительные ингредиенты.`,

  habits: `Проанализируй привычки питания на основе покупок.
Оцени регулярность покупок, импульсивные траты,
предпочтения по брендам и категориям.`,

  diet: `Оцени рацион питания на основе купленных продуктов.
Проверь соответствие нормам БЖУ, калорийности,
наличие всех необходимых групп продуктов.`,

  ask: `Ответь на вопрос пользователя о его покупках, рационе или расходах.
Используй контекст его покупок для персонализированного ответа.`,
};
