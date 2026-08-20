import type {
  ActivityLevel,
  FamilyMember,
  NutritionGoal,
  UserProfile,
} from "./types";

export const nutritionGoalLabels: Record<NutritionGoal, string> = {
  balance: "Сбалансированное питание",
  healthy: "Питаться полезнее",
  cheaper: "Экономить на продуктах",
  lose_weight: "Снизить вес",
  gain_weight: "Набрать вес",
};

export const activityLevelLabels: Record<ActivityLevel, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
};

export function addFoodValue(values: string[], value: string): string[] {
  const food = value.trim();
  if (
    !food ||
    values.some((item) => item.toLocaleLowerCase() === food.toLocaleLowerCase())
  ) {
    return values;
  }
  return [...values, food];
}

export function buildAdditionalInfo(member: FamilyMember): string {
  const parts = [
    member.likedFoods.length > 0
      ? `Любимые продукты: ${member.likedFoods.join(", ")}`
      : "",
    member.dislikedFoods.length > 0
      ? `Не любит: ${member.dislikedFoods.join(", ")}`
      : "",
    `Цель питания: ${nutritionGoalLabels[member.nutritionGoal]}`,
    `Уровень физической нагрузки: ${activityLevelLabels[member.activityLevel]}`,
    member.additionalInfo?.trim() ?? "",
  ].filter(Boolean);
  return parts.join(". ");
}

export function familyMemberToApiMember(member: FamilyMember) {
  return {
    name: member.name,
    age: member.age,
    height: member.heightCm,
    weight: member.weightKg,
    gender: member.gender === "male" ? "Мужской" : "Женский",
    additional_info: buildAdditionalInfo(member),
  };
}

export function ownerToFamilyMember(profile: UserProfile): FamilyMember {
  const {
    familySize: _familySize,
    hasChildren: _hasChildren,
    familyMembers: _familyMembers,
    ...owner
  } = profile;
  return owner;
}

export function buildProfileContext(profile: UserProfile): string {
  return buildAdditionalInfo(ownerToFamilyMember(profile));
}
