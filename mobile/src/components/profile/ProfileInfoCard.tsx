import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { Theme } from "@/themes";
import {
  activityLevelLabels,
  nutritionGoalLabels,
} from "../../profileNutrition";
import type { UserProfile } from "../../types";
import { useTheme } from "../ThemeContext";
import { getAccountTheme } from "./accountTheme";
import { NutritionProfileFields } from "./NutritionProfileFields";

interface ProfileInfoCardProps {
  profile: UserProfile;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onProfileChange: (profile: UserProfile) => void;
}

function ProfileValue({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme);
  const accountTheme = getAccountTheme(theme, themeName);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Изменить: ${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.valueCard,
        { backgroundColor: accountTheme.card, opacity: pressed ? 0.78 : 1 },
      ]}
    >
      <Text style={[styles.valueLabel, { color: accountTheme.muted }]}>
        {label}
      </Text>
      <Text style={[styles.value, { color: accountTheme.text }]}>{value}</Text>
    </Pressable>
  );
}

function ChipGroup({
  label,
  values,
  highlighted = false,
}: {
  label: string;
  values: string[];
  highlighted?: boolean;
}) {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme);
  const accountTheme = getAccountTheme(theme, themeName);
  return (
    <View style={[styles.groupCard, { backgroundColor: accountTheme.card }]}>
      <Text style={[styles.valueLabel, { color: accountTheme.muted }]}>
        {label}
      </Text>
      <View style={styles.chips}>
        {values.length > 0 ? (
          values.map((value) => (
            <View
              key={value}
              style={[
                styles.chip,
                {
                  backgroundColor: highlighted
                    ? accountTheme.accent
                    : accountTheme.chip,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: highlighted
                      ? accountTheme.accentText
                      : accountTheme.text,
                  },
                ]}
              >
                {value}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.emptyValue, { color: accountTheme.muted }]}>
            Пока не указано
          </Text>
        )}
      </View>
    </View>
  );
}

export function ProfileInfoCard({
  profile,
  editing,
  onEdit,
  onCancel,
  onSave,
  onProfileChange,
}: ProfileInfoCardProps) {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme);
  const accountTheme = getAccountTheme(theme, themeName);

  if (editing)
    return (
      <View style={styles.editing}>
        <Text style={styles.sectionLabel}>
          ЛИЧНАЯ ИНФОРМАЦИЯ
        </Text>
        <View style={styles.editGrid}>
          <TextInput
            accessibilityLabel="Имя"
            value={profile.name}
            onChangeText={(name) => onProfileChange({ ...profile, name })}
            placeholder="Ваше имя"
            placeholderTextColor={accountTheme.muted}
            style={[
              styles.input,
              styles.fullWidth,
              { backgroundColor: accountTheme.card, color: accountTheme.text },
            ]}
          />
          <View style={styles.fullWidth}>
            <NutritionProfileFields
              value={profile}
              onChange={(patch) => onProfileChange({ ...profile, ...patch })}
            />
          </View>
          <TextInput
            accessibilityLabel="Возраст"
            value={profile.age.toString()}
            onChangeText={(value) =>
              onProfileChange({
                ...profile,
                age: Number.parseInt(value, 10) || 0,
              })
            }
            keyboardType="number-pad"
            placeholder="Возраст"
            placeholderTextColor={accountTheme.muted}
            style={[
              styles.input,
              { backgroundColor: accountTheme.card, color: accountTheme.text },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Изменить пол"
            onPress={() =>
              onProfileChange({
                ...profile,
                gender: profile.gender === "male" ? "female" : "male",
              })
            }
            style={[
              styles.input,
              styles.genderInput,
              { backgroundColor: accountTheme.card },
            ]}
          >
            <Text style={{ color: accountTheme.text }}>
              {profile.gender === "male" ? "Мужской" : "Женский"}
            </Text>
          </Pressable>
          <TextInput
            accessibilityLabel="Рост"
            value={profile.heightCm.toString()}
            onChangeText={(value) =>
              onProfileChange({
                ...profile,
                heightCm: Number.parseInt(value, 10) || 0,
              })
            }
            keyboardType="number-pad"
            placeholder="Рост, см"
            placeholderTextColor={accountTheme.muted}
            style={[
              styles.input,
              { backgroundColor: accountTheme.card, color: accountTheme.text },
            ]}
          />
          <TextInput
            accessibilityLabel="Вес"
            value={profile.weightKg.toString()}
            onChangeText={(value) =>
              onProfileChange({
                ...profile,
                weightKg: Number.parseInt(value, 10) || 0,
              })
            }
            keyboardType="number-pad"
            placeholder="Вес, кг"
            placeholderTextColor={accountTheme.muted}
            style={[
              styles.input,
              { backgroundColor: accountTheme.card, color: accountTheme.text },
            ]}
          />
          <TextInput
            accessibilityLabel="Дополнительная информация"
            value={profile.additionalInfo ?? ""}
            onChangeText={(additionalInfo) =>
              onProfileChange({ ...profile, additionalInfo })
            }
            multiline
            placeholder="Аллергии, цели и особенности питания"
            placeholderTextColor={accountTheme.muted}
            textAlignVertical="top"
            style={[
              styles.input,
              styles.fullWidth,
              styles.textArea,
              { backgroundColor: accountTheme.card, color: accountTheme.text },
            ]}
          />
        </View>
        <View style={styles.editActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Отменить редактирование личной информации"
            onPress={onCancel}
            style={[
              styles.secondaryButton,
              { backgroundColor: accountTheme.chip },
            ]}
          >
            <Text style={{ color: accountTheme.text }}>Отмена</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Сохранить личную информацию"
            onPress={onSave}
            style={[
              styles.primaryButton,
              { backgroundColor: accountTheme.accent },
            ]}
          >
            <Text style={{ color: accountTheme.accentText }}>Сохранить</Text>
          </Pressable>
        </View>
      </View>
    );

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { color: accountTheme.muted }]}>
          ЛИЧНАЯ ИНФОРМАЦИЯ
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Изменить личную информацию"
          onPress={onEdit}
        >
          <Text style={styles.editLink}>
            Изменить
          </Text>
        </Pressable>
      </View>
      <ProfileValue
        label="ИМЯ"
        value={profile.name || "Не указано"}
        onPress={onEdit}
      />
      <View style={styles.pair}>
        <ProfileValue
          label="ВОЗРАСТ"
          value={`${profile.age}`}
          onPress={onEdit}
        />
        <ProfileValue
          label="ПОЛ"
          value={profile.gender === "male" ? "Мужской" : "Женский"}
          onPress={onEdit}
        />
      </View>
      <View style={styles.pair}>
        <ProfileValue
          label="РОСТ"
          value={`${profile.heightCm} см`}
          onPress={onEdit}
        />
        <ProfileValue
          label="ВЕС"
          value={`${profile.weightKg} кг`}
          onPress={onEdit}
        />
      </View>
      <ChipGroup
        label="НРАВИТСЯ В ЕДЕ"
        values={profile.likedFoods}
        highlighted
      />
      <ChipGroup label="НЕ НРАВИТСЯ В ЕДЕ" values={profile.dislikedFoods} />
      <View
        style={[styles.detailsCard, { backgroundColor: accountTheme.card }]}
      >
        <Text style={[styles.valueLabel, { color: accountTheme.muted }]}>
          ЦЕЛЬ ПИТАНИЯ
        </Text>
        <Text style={[styles.details, { color: accountTheme.text }]}>
          {nutritionGoalLabels[profile.nutritionGoal]}
        </Text>
        <Text
          style={[
            styles.valueLabel,
            { color: accountTheme.muted, marginTop: 16 },
          ]}
        >
          УРОВЕНЬ НАГРУЗКИ
        </Text>
        <Text style={[styles.details, { color: accountTheme.text }]}>
          {activityLevelLabels[profile.activityLevel]}
        </Text>
      </View>
      <View
        style={[styles.detailsCard, { backgroundColor: accountTheme.card }]}
      >
        <Text style={[styles.valueLabel, { color: accountTheme.muted }]}>
          ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ
        </Text>
        <Text
          style={[
            styles.details,
            {
              color: profile.additionalInfo
                ? accountTheme.text
                : accountTheme.muted,
            },
          ]}
        >
          {profile.additionalInfo || "Пока не указано"}
        </Text>
      </View>
      <Text style={[styles.footnote, { color: accountTheme.muted }]}>
        Данные профиля используются для персонализации рекомендаций.
      </Text>
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionLabel: { color: theme.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.1 },
  editLink: {color: theme.accent, fontSize: 13, fontWeight: "700" },
  valueCard: {
    borderRadius: 18,
    flex: 1,
    marginBottom: 12,
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  valueLabel: { fontSize: 10, fontWeight: "700" },
  value: { fontSize: 16, fontWeight: "700", marginTop: 6 },
  pair: { flexDirection: "row", gap: 14 },
  groupCard: { borderRadius: 20, marginBottom: 2, minHeight: 104, padding: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 },
  chip: {
    borderRadius: 17,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 14,
  },
  chipText: { fontSize: 13, fontWeight: "600" },
  emptyValue: { fontSize: 14, paddingVertical: 7 },
  detailsCard: { borderRadius: 20, marginTop: 2, minHeight: 132, padding: 16 },
  details: { fontSize: 14, lineHeight: 20, marginTop: 14 },
  footnote: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 24,
    marginTop: 15,
    paddingRight: 22,
  },
  editing: { marginBottom: 24 },
  editGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  input: {
    borderRadius: 18,
    flexBasis: "45%",
    flexGrow: 1,
    fontSize: 16,
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fullWidth: { flexBasis: "100%" },
  genderInput: { justifyContent: "center" },
  textArea: { minHeight: 116 },
  editActions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 14,
  },
  secondaryButton: {
    borderRadius: 23,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  primaryButton: {
    borderRadius: 23,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
});
