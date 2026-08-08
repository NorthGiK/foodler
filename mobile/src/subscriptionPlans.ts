import type { SubscriptionPlan } from "@/api/client";

export type SubscriptionPlanDetails = {
  id: SubscriptionPlan;
  title: string;
  price: string;
  features: readonly string[];
};

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlanDetails[] = [
  {
    id: "budget_monthly",
    title: "Базовая подписка",
    price: "300 ₽ / месяц",
    features: [
      "Увеличенный доступ к AI-помощнику",
      "Бессрочное серверное хранение новых чеков",
    ],
  },
  {
    id: "premium_monthly",
    title: "Premium подписка",
    price: "800 ₽ / месяц",
    features: ["Все преимущества Базовой подписки", "Улучшенные AI-советы"],
  },
];

export function subscriptionActionLabel(
  plan: SubscriptionPlan,
  activePlan: SubscriptionPlan | null | undefined,
): string {
  if (activePlan === plan) return "Продлить";
  if (activePlan === "budget_monthly" && plan === "premium_monthly") {
    return "Перейти на Premium";
  }
  return "Оформить";
}
