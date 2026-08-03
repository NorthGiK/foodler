import AsyncStorage from "@react-native-async-storage/async-storage";
import { ShakeInput } from "@/components/ShakeInput";
import { isValidEmail } from "@/utils";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { useAuth } from "../api/auth";
import { useTheme } from "../components/ThemeContext";
import { policy } from "../config";
import { AnimatedPressable } from "@/components/animations";

type Step = "credentials" | "code";

const POLICIES_ACCEPTED_KEY = "@policies_accepted";

const POLICY_ENTRIES: {
  key: keyof typeof policy;
  label: string;
}[] = [
  {
    key: "PRIVACY_POLICY",
    label: "Политика конфиденциальности",
  },
  {
    key: "TERMS_OF_SERVICE",
    label: "Пользовательское соглашение",
  },
  {
    key: "CONSENT_TO_THE_PROCESSING_OF_PERSONAL_DATA",
    label: "Согласие на обработку персональных данных",
  },
  {
    key: "CONSENT_TO_THE_PROCESSING_OF_SPECIAL_CATEGORIES_OF_PERSONAL_DATA",
    label: "Согласие на обработку специальных категорий персональных данных",
  },
];

type Props = {
  skipable?: boolean;
  onPoliciesAccepted?: () => void;
};

export function LoginScreen({ skipable = false, onPoliciesAccepted }: Props) {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { sendCode, verifyCode } = useAuth();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptedPolicies, setAcceptedPolicies] = useState<
    Record<keyof typeof policy, boolean>
  >({
    PRIVACY_POLICY: false,
    TERMS_OF_SERVICE: false,
    CONSENT_TO_THE_PROCESSING_OF_PERSONAL_DATA: false,
    CONSENT_TO_THE_PROCESSING_OF_SPECIAL_CATEGORIES_OF_PERSONAL_DATA: false,
  });

  const allPoliciesAccepted = Object.values(acceptedPolicies).every(Boolean);

  const togglePolicy = (key: keyof typeof policy) => {
    setAcceptedPolicies((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openPolicyUrl = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert("Ошибка", "Не удалось открыть ссылку");
    });
  };

  const errorAlert = (err: string) =>
    Alert.alert("Ошибка", err, [{ text: "OK", style: "cancel" }]);

  useEffect(() => {
    if (step === "code") {
      setError("");
    }
  }, [step]);

  const reset = () => {
    setStep("credentials");
    setEmail("");
    setPassword("");
    setCode("");
    setError("");
    setAcceptedPolicies({
      PRIVACY_POLICY: false,
      TERMS_OF_SERVICE: false,
      CONSENT_TO_THE_PROCESSING_OF_PERSONAL_DATA: false,
      CONSENT_TO_THE_PROCESSING_OF_SPECIAL_CATEGORIES_OF_PERSONAL_DATA: false,
    });
  };

  const handlePoliciesAccepted = async () => {
    await AsyncStorage.setItem(POLICIES_ACCEPTED_KEY, "true");
    onPoliciesAccepted?.();
  };

  const handleSkipLogin = async () => {
    await handlePoliciesAccepted();
  };

  const handleBackToCredentials = () => {
    setStep("credentials");
    setError("");
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError("Введите email");
      return;
    } else if (!isValidEmail(email.trim())) {
      setError("Введён некорректный email");
      return;
    } else if (password.length < 8) {
      setError("Пароль должен быть не менее 8 символов");
      return;
    } else if (!/[A-Z]/.test(password)) {
      setError("Пароль должен содержать хотя бы одну заглавную букву");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await sendCode(email.trim(), password.trim());
      setError("");
      setStep("code");
    } catch (error: unknown) {
      const originalMessage =
        error instanceof Error ? error.message : "Не удалось отправить код";
      const msg = originalMessage.includes("fetch failed")
        ? "Ошибка отправки. Проверьте подключение к интернету"
        : originalMessage;
      setError(msg);
      errorAlert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) {
      setError("Введите код подтверждения");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await verifyCode(email.trim(), code.trim(), password);
      await handlePoliciesAccepted();

      navigation.goBack();
      reset();
      Alert.alert("Успешно", "Вы вошли в аккаунт");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Неверный код");
    } finally {
      setLoading(false);
    }
  };

  const MutedButton = ({
    text,
    onPress,
    textColor,
    active,
  }: {
    text: string;
    onPress: () => void | Promise<void>;
    textColor?: string;
    active?: boolean;
  }) => {
    return (
      <AnimatedPressable
        onPress={onPress}
        style={styles.toggle}
        disabled={!active}
      >
        <Text style={[styles.toggleText, { color: textColor || theme.text }]}>
          {text}
        </Text>
      </AnimatedPressable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        {!skipable && (
          <Pressable onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
        )}
        <Text style={[styles.title, { color: theme.text }]}>
          {step === "credentials" ? "Вход" : "Подтверждение email"}
        </Text>
        <View style={{ width: skipable ? 0 : 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === "credentials" ? (
          <>
            <Text style={[styles.subtitle, { color: theme.muted }]}>
              {skipable
                ? "Примите политики, чтобы продолжить"
                : "Введите email и пароль. Мы отправим код подтверждения на почту."}
            </Text>

            {!skipable && (
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <ShakeInput
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="example@mail.com"
                  placeholderTextColor={theme.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={error}
                  style={{ marginBottom: 12 }}
                />

                <ShakeInput
                  label="Пароль"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={theme.muted}
                  secureTextEntry
                  error={error}
                  style={{ marginBottom: 12 }}
                />
              </View>
            )}

            {/* Policy checkboxes */}
            <View
              style={[
                styles.card,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.policyTitle, { color: theme.text }]}>
                Я принимаю следующие документы:
              </Text>
              <View style={styles.policySection}>
                {POLICY_ENTRIES.map((entry) => (
                  <View key={entry.key} style={styles.policyRow}>
                    <Pressable
                      onPress={() => togglePolicy(entry.key)}
                      style={[
                        styles.checkbox,
                        {
                          borderColor: theme.border,
                          backgroundColor: acceptedPolicies[entry.key]
                            ? theme.primary
                            : "transparent",
                        },
                      ]}
                    >
                      {acceptedPolicies[entry.key] && (
                        <MaterialIcons
                          name="check"
                          size={14}
                          color={theme.white}
                        />
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => openPolicyUrl(policy[entry.key])}
                      style={styles.policyLabel}
                    >
                      <Text
                        style={[styles.policyText, { color: theme.primary }]}
                      >
                        {entry.label}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>

            {!skipable && (
              <>
                <Pressable
                  style={[
                    styles.submitBtn,
                    {
                      backgroundColor: theme.primary,
                      opacity: loading || !allPoliciesAccepted ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleSendCode}
                  disabled={loading || !allPoliciesAccepted}
                >
                  {loading ? (
                    <ActivityIndicator color={theme.white} />
                  ) : (
                    <Text style={[styles.submitText, { color: theme.white }]}>
                      Получить код
                    </Text>
                  )}
                </Pressable>

                <MutedButton
                  text="Забыли пароль?"
                  onPress={() => navigation.navigate("ForgotPassword")}
                  textColor={theme.primary + (allPoliciesAccepted ? "" : "88")}
                  active={allPoliciesAccepted}
                />
              </>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: theme.muted }]}>
              Мы отправили код на {email}. Введите его ниже.
            </Text>

            <View
              style={[
                styles.card,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <ShakeInput
                label="Код подтверждения"
                value={code}
                onChangeText={setCode}
                placeholder="abcd1234"
                placeholderTextColor={theme.muted}
                maxLength={8}
                autoFocus
                autoCapitalize="none"
                error={error}
              />

              <Pressable
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: theme.primary,
                    opacity: loading ? 0.6 : 1,
                  },
                ]}
                onPress={handleVerifyCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.white} />
                ) : (
                  <Text style={[styles.submitText, { color: theme.white }]}>
                    Подтвердить
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={handleBackToCredentials}
                style={styles.backBtn}
              >
                <Text style={[styles.backText, { color: theme.muted }]}>
                  Назад
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {step === "credentials" && skipable && (
          <MutedButton
            text="Продолжить без авторизации"
            onPress={handleSkipLogin}
            textColor={theme.muted + (allPoliciesAccepted ? "" : "88")}
            active={allPoliciesAccepted}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  card: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    gap: 14,
  },
  policyTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  policySection: {
    gap: 10,
  },
  policyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  policyLabel: {
    flex: 1,
    paddingVertical: 2,
  },
  policyText: {
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "700",
  },
  backBtn: {
    alignItems: "center",
    marginTop: 12,
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
  },
  toggle: {
    alignItems: "center",
    marginTop: 20,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
