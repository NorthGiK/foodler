import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { RootStackParamList } from "../../App";
import { useTheme } from "../components/ThemeContext";
import { NutritionProfileFields } from "../components/profile";
import { loadProfile, saveProfile } from "../profileStorage";
import { FamilyMember, defaultProfile } from "../types";

const emptyMember = (): FamilyMember => ({
  name: "",
  age: 0,
  gender: "male",
  heightCm: 0,
  weightKg: 0,
  likedFoods: [],
  dislikedFoods: [],
  nutritionGoal: "balance",
  activityLevel: "low",
});

export function FamilyMemberScreen() {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } =
    useRoute<
      import("@react-navigation/native").RouteProp<
        RootStackParamList,
        "FamilyMember"
      >
    >();
  const [member, setMember] = useState<FamilyMember>(emptyMember);
  const [error, setError] = useState("");
  const editing = params.index !== undefined;
  useEffect(() => {
    void loadProfile().then((profile) =>
      setMember(
        params.index === undefined
          ? emptyMember()
          : (profile.familyMembers[params.index] ?? emptyMember()),
      ),
    );
  }, [params.index]);
  const update = (patch: Partial<FamilyMember>) =>
    setMember((current) => ({ ...current, ...patch }));
  const save = async () => {
    if (!member.name.trim()) {
      setError("Введите имя члена семьи");
      return;
    }
    const profile = (await loadProfile()) ?? defaultProfile;
    const familyMembers = [...profile.familyMembers];
    if (params.index === undefined) familyMembers.push(member);
    else familyMembers[params.index] = member;
    await saveProfile({ ...profile, familyMembers });
    navigation.goBack();
  };
  const field = (
    label: string,
    placeholder: string,
    value: string,
    onChangeText: (value: string) => void,
    keyboardType?: "number-pad",
    multiline: boolean = false,
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        multiline={multiline}
        style={[
          styles.input,
          {
            color: theme.text,
            borderColor: theme.outline,
            backgroundColor: theme.surfaceElevated,
          },
        ]}
      />
    </View>
  );
  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable
          accessibilityLabel="Назад к семье"
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={25} color={theme.secondary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.secondary }]}>
          {editing ? "Изменить члена семьи" : "Добавить члена семьи"}
        </Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {field("Имя", "Иван", member.name, (value) => {
          update({ name: value });
          setError("");
        })}
        {error ? <Text style={{ color: theme.error }}>{error}</Text> : null}
        {field(
          "Возраст",
          "30",
          String(member.age || ""),
          (value) => update({ age: Number(value) || 0 }),
          "number-pad",
        )}
        <View style={styles.row}>
          {field(
            "Рост (см)",
            "170",
            String(member.heightCm || ""),
            (value) => update({ heightCm: Number(value) || 0 }),
            "number-pad",
          )}
          {field(
            "Вес (кг)",
            "70",
            String(member.weightKg || ""),
            (value) => update({ weightKg: Number(value) || 0 }),
            "number-pad",
          )}
        </View>
        <Pressable
          style={[
            styles.gender,
            {
              borderColor: theme.outline,
              backgroundColor: theme.surfaceElevated,
            },
          ]}
          onPress={() =>
            update({ gender: member.gender === "male" ? "female" : "male" })
          }
        >
          <Text style={{ color: theme.text }}>
            Пол: {member.gender === "male" ? "Мужской" : "Женский"}
          </Text>
        </Pressable>
        <NutritionProfileFields value={member} onChange={update} />
        {field(
          "Дополнительно",
          "Тренажёрный зал 3 раза в неделю по полтора часа, интенсивное кардио в основном.\n" +
            "Аллергия на орехи\n" +
            "Люблю сладкое",
          member.additionalInfo ?? "",
          (value) => update({ additionalInfo: value }),
          undefined,
          true,
        )}
        <Pressable
          accessibilityLabel="Сохранить члена семьи"
          onPress={() => void save()}
          style={[styles.save, { backgroundColor: theme.primary }]}
        >
          <Text style={{ color: theme.white, fontWeight: "700", fontSize: 16 }}>
            {editing ? "Сохранить" : "Добавить"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: "700" },
  spacer: { width: 25 },
  content: { gap: 14, padding: 18 },
  field: { flex: 1, gap: 6 },
  label: { fontSize: 13, fontWeight: "600" },
  input: { borderRadius: 14, borderWidth: 1, fontSize: 15, padding: 13 },
  row: { flexDirection: "row", gap: 12 },
  gender: { borderRadius: 14, borderWidth: 1, padding: 14 },
  save: { alignItems: "center", borderRadius: 14, padding: 15, marginTop: 8 },
});
