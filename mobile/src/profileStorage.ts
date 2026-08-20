import AsyncStorage from "@react-native-async-storage/async-storage";
import { FamilyMember, UserProfile, defaultProfile } from "./types";

const PROFILE_KEY = "@food_tracker_profile";

function normalizeMember(value: unknown): FamilyMember {
  const member =
    typeof value === "object" && value !== null
      ? (value as Partial<FamilyMember>)
      : {};
  return {
    name: typeof member.name === "string" ? member.name : "",
    age: typeof member.age === "number" ? member.age : 0,
    gender: member.gender === "female" ? "female" : "male",
    heightCm: typeof member.heightCm === "number" ? member.heightCm : 0,
    weightKg: typeof member.weightKg === "number" ? member.weightKg : 0,
    likedFoods: Array.isArray(member.likedFoods)
      ? member.likedFoods.filter(
          (food): food is string => typeof food === "string",
        )
      : [],
    dislikedFoods: Array.isArray(member.dislikedFoods)
      ? member.dislikedFoods.filter(
          (food): food is string => typeof food === "string",
        )
      : [],
    nutritionGoal:
      member.nutritionGoal === "healthy" ||
      member.nutritionGoal === "cheaper" ||
      member.nutritionGoal === "lose_weight" ||
      member.nutritionGoal === "gain_weight"
        ? member.nutritionGoal
        : "balance",
    activityLevel:
      member.activityLevel === "medium" || member.activityLevel === "high"
        ? member.activityLevel
        : "low",
    additionalInfo:
      typeof member.additionalInfo === "string"
        ? member.additionalInfo
        : undefined,
  };
}

export async function loadProfile(): Promise<UserProfile> {
  try {
    const json = await AsyncStorage.getItem(PROFILE_KEY);
    if (json) {
      const parsed = JSON.parse(json);
      const owner = normalizeMember(parsed);
      return {
        ...defaultProfile,
        ...owner,
        familySize:
          typeof parsed.familySize === "number"
            ? parsed.familySize
            : defaultProfile.familySize,
        hasChildren:
          typeof parsed.hasChildren === "boolean"
            ? parsed.hasChildren
            : defaultProfile.hasChildren,
        familyMembers: Array.isArray(parsed.familyMembers)
          ? parsed.familyMembers.map(normalizeMember)
          : [],
      };
    }
  } catch {
    console.warn("Profile could not be loaded");
  }
  return { ...defaultProfile };
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
