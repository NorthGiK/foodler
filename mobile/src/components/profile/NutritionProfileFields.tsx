import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  activityLevelLabels,
  addFoodValue,
  nutritionGoalLabels,
} from "../../profileNutrition";
import type { ActivityLevel, FamilyMember, NutritionGoal } from "../../types";
import { useTheme } from "../ThemeContext";

type NutritionFields = Pick<
  FamilyMember,
  "likedFoods" | "dislikedFoods" | "nutritionGoal" | "activityLevel"
>;

interface Props {
  value: NutritionFields;
  onChange: (patch: Partial<NutritionFields>) => void;
}

const goalOptions = Object.entries(nutritionGoalLabels) as [
  NutritionGoal,
  string,
][];
const activityOptions = Object.entries(activityLevelLabels) as [
  ActivityLevel,
  string,
][];

export function NutritionProfileFields({ value, onChange }: Props) {
  const { theme } = useTheme();
  const [likedInput, setLikedInput] = useState("");
  const [dislikedInput, setDislikedInput] = useState("");
  const [picker, setPicker] = useState<"goal" | "activity" | null>(null);
  const foodEditor = (
    label: string,
    foods: string[],
    input: string,
    setInput: (next: string) => void,
    field: "likedFoods" | "dislikedFoods",
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View style={styles.foodInputRow}>
        <TextInput
          accessibilityLabel={`Добавить продукт: ${label}`}
          value={input}
          onChangeText={setInput}
          placeholder="Например, яблоки"
          placeholderTextColor={theme.muted}
          onSubmitEditing={() => {
            const next = addFoodValue(foods, input);
            if (next !== foods) onChange({ [field]: next });
            setInput("");
          }}
          style={[
            styles.input,
            styles.foodInput,
            {
              borderColor: theme.outline,
              backgroundColor: theme.surfaceElevated,
              color: theme.text,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Добавить продукт в ${label}`}
          onPress={() => {
            const next = addFoodValue(foods, input);
            if (next !== foods) onChange({ [field]: next });
            setInput("");
          }}
          style={[styles.addButton, { backgroundColor: theme.primary }]}
        >
          <Text style={{ color: theme.white, fontWeight: "700" }}>
            Добавить
          </Text>
        </Pressable>
      </View>
      {foods.length > 0 ? (
        <View style={styles.chips}>
          {foods.map((food) => (
            <View
              key={food}
              style={[styles.chip, { backgroundColor: theme.primaryContainer }]}
            >
              <Text style={{ color: theme.onPrimaryContainer }}>{food}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Удалить ${food} из ${label}`}
                onPress={() =>
                  onChange({ [field]: foods.filter((item) => item !== food) })
                }
              >
                <Text style={[styles.remove, { color: theme.primary }]}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
  const options = picker === "goal" ? goalOptions : activityOptions;
  const title = picker === "goal" ? "Цель питания" : "Уровень нагрузки";

  return (
    <View style={styles.content}>
      {foodEditor(
        "Нравится в еде",
        value.likedFoods,
        likedInput,
        setLikedInput,
        "likedFoods",
      )}
      {foodEditor(
        "Не нравится в еде",
        value.dislikedFoods,
        dislikedInput,
        setDislikedInput,
        "dislikedFoods",
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Выбрать цель питания"
        onPress={() => setPicker("goal")}
        style={[
          styles.select,
          {
            borderColor: theme.outline,
            backgroundColor: theme.surfaceElevated,
          },
        ]}
      >
        <Text style={[styles.label, { color: theme.text }]}>Цель питания</Text>
        <Text style={{ color: theme.muted }}>
          {nutritionGoalLabels[value.nutritionGoal]}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Выбрать уровень нагрузки"
        onPress={() => setPicker("activity")}
        style={[
          styles.select,
          {
            borderColor: theme.outline,
            backgroundColor: theme.surfaceElevated,
          },
        ]}
      >
        <Text style={[styles.label, { color: theme.text }]}>
          Уровень нагрузки
        </Text>
        <Text style={{ color: theme.muted }}>
          {activityLevelLabels[value.activityLevel]}
        </Text>
      </Pressable>
      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable
            style={[styles.modal, { backgroundColor: theme.surface }]}
            onPress={() => undefined}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {title}
            </Text>
            {options.map(([option, label]) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => {
                  onChange(
                    picker === "goal"
                      ? { nutritionGoal: option as NutritionGoal }
                      : { activityLevel: option as ActivityLevel },
                  );
                  setPicker(null);
                }}
                style={styles.option}
              >
                <Text style={{ color: theme.text }}>{label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600" },
  foodInputRow: { flexDirection: "row", gap: 8 },
  input: { borderRadius: 14, borderWidth: 1, fontSize: 15, padding: 13 },
  foodInput: { flex: 1 },
  addButton: {
    alignItems: "center",
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  remove: { fontSize: 20, lineHeight: 20 },
  select: { borderRadius: 14, borderWidth: 1, gap: 4, padding: 14 },
  backdrop: {
    alignItems: "center",
    backgroundColor: "#0008",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  modal: { borderRadius: 18, maxWidth: 420, padding: 20, width: "100%" },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  option: { paddingVertical: 14 },
});
