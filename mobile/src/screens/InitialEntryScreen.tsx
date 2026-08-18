import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { useTheme } from "../components/ThemeContext";
import { policy } from "../config";
import LogoBrand from "@/components/ui/LogoBrand";

const POLICIES_ACCEPTED_KEY = "@policies_accepted";
const basket = require("../assets/ProductBasket.png") as number;

type PolicyEntry = {
  description: string;
  icon: "description" | "shield" | "fact-check" | "info-outline";
  key: keyof typeof policy;
  title: string;
};

const POLICY_ENTRIES: PolicyEntry[] = [
  {
    key: "TERMS_OF_SERVICE",
    title: "Пользовательское соглашение",
    description: "Общие условия использования сервиса",
    icon: "description",
  },
  {
    key: "PRIVACY_POLICY",
    title: "Политика конфиденциальности",
    description: "Как мы собираем и защищаем данные",
    icon: "shield",
  },
  {
    key: "CONSENT_TO_THE_PROCESSING_OF_PERSONAL_DATA",
    title: "Согласие на обработку персональных данных",
    description: "Условия обработки ваших данных",
    icon: "fact-check",
  },
  {
    key: "CONSENT_TO_THE_PROCESSING_OF_SPECIAL_CATEGORIES_OF_PERSONAL_DATA",
    title: "Важная информация об обработке данных",
    description: "Условия обработки специальных категорий данных",
    icon: "info-outline",
  },
];

type EntryStep = "policies" | "choice";

export function InitialEntryScreen({
  onPoliciesAccepted,
}: {
  onPoliciesAccepted: () => Promise<void>;
}) {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [step, setStep] = useState<EntryStep>("policies");
  const [accepted, setAccepted] = useState<
    Record<keyof typeof policy, boolean>
  >({
    PRIVACY_POLICY: false,
    TERMS_OF_SERVICE: false,
    CONSENT_TO_THE_PROCESSING_OF_PERSONAL_DATA: false,
    CONSENT_TO_THE_PROCESSING_OF_SPECIAL_CATEGORIES_OF_PERSONAL_DATA: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const allAccepted = Object.values(accepted).every(Boolean);

  const openPolicy = async (key: keyof typeof policy) => {
    try {
      await Linking.openURL(policy[key]);
    } catch {
      Alert.alert("Ошибка", "Не удалось открыть документ");
    }
  };

  const continueToChoice = async () => {
    if (!allAccepted || isSaving) return;
    setIsSaving(true);
    try {
      await AsyncStorage.setItem(POLICIES_ACCEPTED_KEY, "true");
      await onPoliciesAccepted();
      setStep("choice");
    } finally {
      setIsSaving(false);
    }
  };

  const enterAsGuest = () => navigation.replace("Main");
  const enterWithAccount = () =>
    navigation.replace("Login", { initialEntry: true });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <LogoBrand />
        <Text style={[styles.title, { color: theme.text }]}>
          Ваши покупки —{"\n"}в ясных цифрах
        </Text>
        <Image
          source={basket}
          style={styles.illustration}
          accessibilityLabel="Продукты Foodler"
        />

        {step === "policies" ? (
          <View style={styles.body}>
            <Text style={[styles.sectionTitle, { color: theme.secondary }]}>
              Перед началом
            </Text>
            <Text style={[styles.copy, { color: theme.muted }]}>
              Подтвердите согласие с документами,{"\n"}чтобы продолжить работу в
              приложении.
            </Text>
            <View style={styles.policyList}>
              {POLICY_ENTRIES.map((entry) => (
                <View
                  key={entry.key}
                  style={[
                    styles.policyRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={entry.title}
                    accessibilityState={{ checked: accepted[entry.key] }}
                    onPress={() =>
                      setAccepted((current) => ({
                        ...current,
                        [entry.key]: !current[entry.key],
                      }))
                    }
                    style={[
                      styles.checkbox,
                      {
                        borderColor: accepted[entry.key]
                          ? theme.secondary
                          : theme.outline,
                        backgroundColor: accepted[entry.key]
                          ? theme.secondary
                          : "transparent",
                      },
                    ]}
                  >
                    {accepted[entry.key] ? (
                      <MaterialIcons
                        name="check"
                        size={16}
                        color={theme.white}
                      />
                    ) : null}
                  </Pressable>
                  <MaterialIcons
                    name={entry.icon}
                    size={22}
                    color={theme.secondary}
                  />
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Открыть: ${entry.title}`}
                    onPress={() => void openPolicy(entry.key)}
                    style={styles.policyText}
                  >
                    <Text style={[styles.policyTitle, { color: theme.text }]}>
                      {entry.title}
                    </Text>
                    <Text
                      style={[styles.policyDescription, { color: theme.muted }]}
                    >
                      {entry.description}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Принять и продолжить"
              disabled={!allAccepted || isSaving}
              onPress={() => void continueToChoice()}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: allAccepted
                    ? theme.primary
                    : theme.surfaceElevated,
                  opacity: pressed || isSaving ? 0.78 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: allAccepted ? theme.white : theme.muted },
                ]}
              >
                Принять и продолжить
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.choiceBody}>
            <Text style={[styles.sectionTitle, { color: theme.secondary }]}>
              Выберите запуск
            </Text>
            <Text style={[styles.copy, { color: theme.muted }]}>
              Вы можете войти в аккаунт или{"\n"}продолжить без регистрации.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Войти"
              onPress={enterWithAccount}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <MaterialIcons
                name="person-outline"
                size={22}
                color={theme.white}
              />
              <Text style={[styles.primaryButtonText, { color: theme.white }]}>
                Войти
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Продолжить без аккаунта"
              onPress={enterAsGuest}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: theme.primary, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <MaterialIcons name="eco" size={21} color={theme.secondary} />
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                Продолжить без аккаунта
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 12 },
  brand: { fontSize: 12, fontWeight: "800", letterSpacing: -0.3 },
  title: {
    fontFamily: "serif",
    fontSize: 30,
    fontWeight: "600",
    letterSpacing: -1.3,
    lineHeight: 37,
    marginTop: 16,
  },
  illustration: {
    alignSelf: "center",
    height: 138,
    marginBottom: 1,
    marginTop: 3,
    resizeMode: "contain",
    width: 230,
  },
  body: { flex: 1 },
  choiceBody: { flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginTop: 1 },
  copy: { fontSize: 12, lineHeight: 16, marginTop: 5 },
  policyList: { marginTop: 12 },
  policyRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 55,
    paddingVertical: 7,
  },
  checkbox: {
    alignItems: "center",
    borderRadius: 4,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  policyText: { flex: 1 },
  policyTitle: { fontSize: 11, fontWeight: "600", lineHeight: 14 },
  policyDescription: { fontSize: 9, lineHeight: 12, marginTop: 1 },
  primaryButton: {
    alignItems: "center",
    borderRadius: 5,
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    marginTop: 16,
    marginBottom: 16,
    minHeight: 39,
    paddingHorizontal: 16,
  },
  primaryButtonText: { fontSize: 14, fontWeight: "700" },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 5,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 43,
    paddingHorizontal: 16,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "600" },
});
