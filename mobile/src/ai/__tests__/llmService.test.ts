import { api } from "../../api/client";
import { generateAiResponse, parseServerSections } from "../llmService";

jest.mock("../../api/client", () => ({
  api: {
    runAiAction: jest.fn(),
  },
}));

describe("parseServerSections", () => {
  it("unwraps nested sections and normalizes recipe list items", () => {
    expect(
      parseServerSections([
        {
          type: "text",
          title: "wrapper",
          text: JSON.stringify([
            {
              type: "list",
              title: "Рецепты",
              items: [
                {
                  name: "Омлет",
                  ingredients: ["яйца", "молоко"],
                  preparation: "Смешать",
                },
              ],
            },
          ]),
        },
      ]),
    ).toEqual([
      {
        type: "list",
        title: "Рецепты",
        items: ["Омлет: яйца, молоко — Смешать"],
      },
    ]);
  });

  it("drops malformed sections without weakening the local type", () => {
    expect(
      parseServerSections([
        { type: "score", title: "Оценка", value: "high" },
        { type: "chart", labels: ["A"], values: ["bad"] },
        { type: "text", title: "Текст", text: "Готово" },
      ]),
    ).toEqual([{ type: "text", title: "Текст", text: "Готово" }]);
  });

  it("maps the typed family profile to backend member fields", async () => {
    jest.mocked(api.runAiAction).mockResolvedValue({
      id: "ai-1",
      action: "healthy-food",
      createdAt: "2026-08-02T00:00:00Z",
      sections: [],
    });

    await generateAiResponse("health", {
      receipts: [],
      items: [],
      members: [
        {
          name: "Анна",
          age: 30,
          gender: "female",
          heightCm: 170,
          weightKg: 60,
          dietaryPreferences: ["без лактозы"],
          healthGoals: [],
          additionalInfo: "аллергия",
        },
      ],
    });

    expect(api.runAiAction).toHaveBeenCalledWith("healthy-food", {
      members: [
        {
          name: "Анна",
          age: 30,
          height: 170,
          weight: 60,
          gender: "Женский",
          additional_info: "без лактозы. аллергия",
        },
      ],
    });
  });
});
