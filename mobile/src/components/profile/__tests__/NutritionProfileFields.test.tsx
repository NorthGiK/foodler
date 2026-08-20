import { act, create } from "react-test-renderer";
import { TextInput } from "react-native";

import { NutritionProfileFields } from "../NutritionProfileFields";

jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      muted: "#777",
      onPrimaryContainer: "#531",
      outline: "#ddd",
      primary: "#06f",
      primaryContainer: "#eef",
      surface: "#fff",
      surfaceElevated: "#f7f7f7",
      text: "#111",
      white: "#fff",
    },
  }),
}));

const value = {
  likedFoods: ["Яблоки"],
  dislikedFoods: [],
  nutritionGoal: "balance" as const,
  activityLevel: "low" as const,
};

describe("NutritionProfileFields", () => {
  it("adds and removes foods while ignoring blank and duplicate values", async () => {
    const onChange = jest.fn();
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(
        <NutritionProfileFields value={value} onChange={onChange} />,
      );
    });

    const likedInput = view!.root
      .findAllByType(TextInput)
      .find(
        (input) =>
          input.props.accessibilityLabel === "Добавить продукт: Нравится в еде",
      )!;
    await act(async () => {
      likedInput.props.onChangeText("  яблоки ");
      likedInput.props.onSubmitEditing();
    });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      likedInput.props.onChangeText("Груши");
      view!.root
        .findByProps({
          accessibilityLabel: "Добавить продукт в Нравится в еде",
        })
        .props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith({ likedFoods: ["Яблоки", "Груши"] });

    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Удалить Яблоки из Нравится в еде" })
        .props.onPress();
    });
    expect(onChange).toHaveBeenLastCalledWith({ likedFoods: [] });
  });

  it("exposes all goal and activity options in native modal pickers", async () => {
    const onChange = jest.fn();
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(
        <NutritionProfileFields value={value} onChange={onChange} />,
      );
    });

    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Выбрать цель питания" })
        .props.onPress();
    });
    for (const label of [
      "Сбалансированное питание",
      "Питаться полезнее",
      "Экономить на продуктах",
      "Снизить вес",
      "Набрать вес",
    ]) {
      expect(
        view!.root.findByProps({ accessibilityLabel: label }),
      ).toBeTruthy();
    }
    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Набрать вес" })
        .props.onPress();
    });
    expect(onChange).toHaveBeenLastCalledWith({ nutritionGoal: "gain_weight" });

    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Выбрать уровень нагрузки" })
        .props.onPress();
    });
    for (const label of ["Низкая", "Средняя", "Высокая"]) {
      expect(
        view!.root.findByProps({ accessibilityLabel: label }),
      ).toBeTruthy();
    }
    await act(async () => {
      view!.root.findByProps({ accessibilityLabel: "Высокая" }).props.onPress();
    });
    expect(onChange).toHaveBeenLastCalledWith({ activityLevel: "high" });
  });
});
