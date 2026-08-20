import {
  activityLevelLabels,
  addFoodValue,
  buildAdditionalInfo,
  nutritionGoalLabels,
} from "../profileNutrition";
import type { FamilyMember } from "../types";

const member = (patch: Partial<FamilyMember> = {}): FamilyMember => ({
  name: "Анна",
  age: 30,
  gender: "female",
  heightCm: 170,
  weightKg: 60,
  likedFoods: [],
  dislikedFoods: [],
  nutritionGoal: "balance",
  activityLevel: "low",
  ...patch,
});

describe("profile nutrition", () => {
  it("uses labels for default goal and activity even with empty food lists", () => {
    expect(buildAdditionalInfo(member())).toBe(
      "Цель питания: Сбалансированное питание. Уровень физической нагрузки: Низкая",
    );
  });

  it("combines every nutrition value with manual additional information", () => {
    expect(
      buildAdditionalInfo(
        member({
          likedFoods: ["Яблоки"],
          dislikedFoods: ["Кинза"],
          nutritionGoal: "lose_weight",
          activityLevel: "high",
          additionalInfo: "Аллергия на орехи",
        }),
      ),
    ).toBe(
      "Любимые продукты: Яблоки. Не любит: Кинза. Цель питания: Снизить вес. Уровень физической нагрузки: Высокая. Аллергия на орехи",
    );
    expect(nutritionGoalLabels.cheaper).toBe("Экономить на продуктах");
    expect(activityLevelLabels.medium).toBe("Средняя");
  });

  it("does not add empty or case-insensitive duplicate food values", () => {
    expect(addFoodValue(["Яблоки"], "  яблоки ")).toEqual(["Яблоки"]);
    expect(addFoodValue(["Яблоки"], " ")).toEqual(["Яблоки"]);
    expect(addFoodValue(["Яблоки"], "Груши")).toEqual(["Яблоки", "Груши"]);
  });
});
