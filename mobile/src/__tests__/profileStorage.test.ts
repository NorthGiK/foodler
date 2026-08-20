import AsyncStorage from "@react-native-async-storage/async-storage";

import { loadProfile } from "../profileStorage";

describe("profile storage", () => {
  it("does not migrate legacy dietary preferences and applies nutrition defaults", async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({
        name: "Анна",
        dietaryPreferences: ["Овощи"],
        healthGoals: ["Больше белка"],
        familyMembers: [
          {
            name: "Иван",
            dietaryPreferences: ["Рыба"],
            healthGoals: ["Спорт"],
          },
        ],
      }),
    );

    await expect(loadProfile()).resolves.toMatchObject({
      name: "Анна",
      likedFoods: [],
      dislikedFoods: [],
      nutritionGoal: "balance",
      activityLevel: "low",
      familyMembers: [
        {
          name: "Иван",
          likedFoods: [],
          dislikedFoods: [],
          nutritionGoal: "balance",
          activityLevel: "low",
        },
      ],
    });
  });
});
