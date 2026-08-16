import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { useAuth } from "../api/auth";
import { useTheme } from "../components/ThemeContext";
import { policy } from "../config";
import { isValidEmail } from "../utils";

type Step = "credentials" | "code";
type CredentialField = "email" | "password";
const POLICIES_ACCEPTED_KEY = "@policies_accepted";
const basket = require("../assets/ProductBasket.png") as number;
const POLICY_ENTRIES: { key: keyof typeof policy; label: string }[] = [
  { key: "PRIVACY_POLICY", label: "Политика конфиденциальности" },
  { key: "TERMS_OF_SERVICE", label: "Пользовательское соглашение" },
  {
    key: "CONSENT_TO_THE_PROCESSING_OF_PERSONAL_DATA",
    label: "Согласие на обработку персональных данных",
  },
  {
    key: "CONSENT_TO_THE_PROCESSING_OF_SPECIAL_CATEGORIES_OF_PERSONAL_DATA",
    label: "Согласие на обработку специальных категорий персональных данных",
  },
];

type Props = { skipable?: boolean; onPoliciesAccepted?: () => void };

export function LoginScreen({ skipable = false, onPoliciesAccepted }: Props) {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { sendCode, verifyCode } = useAuth();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [credentialError, setCredentialError] = useState<{
    field: CredentialField;
    message: string;
  } | null>(null);
  const [accepted, setAccepted] = useState<
    Record<keyof typeof policy, boolean>
  >({
    PRIVACY_POLICY: false,
    TERMS_OF_SERVICE: false,
    CONSENT_TO_THE_PROCESSING_OF_PERSONAL_DATA: false,
    CONSENT_TO_THE_PROCESSING_OF_SPECIAL_CATEGORIES_OF_PERSONAL_DATA: false,
  });
  const allAccepted = Object.values(accepted).every(Boolean);

  useEffect(() => {
    if (step === "code") {
      setError("");
      setCredentialError(null);
    }
  }, [step]);
  const acceptPolicies = async () => {
    await AsyncStorage.setItem(POLICIES_ACCEPTED_KEY, "true");
    onPoliciesAccepted?.();
  };
  const update = (field: CredentialField, value: string) => {
    if (field === "email") {
      setEmail(value);
    } else {
      setPassword(value);
    }
    setError("");
    setCredentialError((current) =>
      current?.field === field ? null : current,
    );
  };
  const send = async () => {
    if (!email.trim())
      return setCredentialError({ field: "email", message: "Введите email" });
    if (!isValidEmail(email.trim()))
      return setCredentialError({
        field: "email",
        message: "Введён некорректный email",
      });
    if (password.length < 8)
      return setCredentialError({
        field: "password",
        message: "Пароль должен быть не менее 8 символов",
      });
    if (!/[A-Z]/.test(password))
      return setCredentialError({
        field: "password",
        message: "Пароль должен содержать хотя бы одну заглавную букву",
      });
    setLoading(true);
    setCredentialError(null);
    try {
      await sendCode(email.trim(), password.trim());
      setStep("code");
    } catch {
      const message = "Ошибка отправки. Проверьте подключение к интернету.";
      setError(message);
      Alert.alert("Ошибка", message);
    } finally {
      setLoading(false);
    }
  };
  const verify = async () => {
    if (!code.trim()) {
      setError("Введите код подтверждения");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await verifyCode(email.trim(), code.trim(), password);
      await acceptPolicies();
      navigation.goBack();
      Alert.alert("Успешно", "Вы вошли в аккаунт");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Неверный код");
    } finally {
      setLoading(false);
    }
  };
  const field = (
    label: string,
    icon: "email" | "lock-outline",
    value: string,
    onChangeText: (text: string) => void,
    passwordField = false,
  ) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.secondary }]}>{label}</Text>
      <View
        style={[
          styles.inputShell,
          {
            backgroundColor: theme.surface,
            borderColor:
              credentialError?.field === (passwordField ? "password" : "email")
                ? theme.error
                : theme.border,
          },
        ]}
      >
        <MaterialIcons name={icon} size={20} color={theme.secondary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={
            passwordField ? "Минимум 8 символов" : "name@example.com"
          }
          placeholderTextColor={theme.muted}
          secureTextEntry={passwordField && !isPasswordVisible}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={passwordField ? "default" : "email-address"}
          style={[styles.input, { color: theme.text }]}
        />
        {passwordField ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isPasswordVisible ? "Скрыть пароль" : "Показать пароль"
            }
            accessibilityHint="Переключает видимость введённого пароля"
            hitSlop={8}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={styles.passwordToggle}
          >
            <MaterialIcons
              name={isPasswordVisible ? "visibility-off" : "visibility"}
              size={21}
              color={theme.muted}
            />
          </Pressable>
        ) : null}
      </View>
      {credentialError?.field === (passwordField ? "password" : "email") ? (
        <Text style={[styles.error, { color: theme.error }]}>
          {credentialError.message}
        </Text>
      ) : null}
    </View>
  );
  const button = (title: string, onPress: () => void, disabled = false) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.cta,
        {
          backgroundColor: theme.primary,
          // borderColor: theme.secondary,
          opacity: disabled || pressed ? 0.7 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.white} />
      ) : (
        <Text style={[styles.ctaText, { color: theme.white }]}>{title}</Text>
      )}
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.topbar}>
        {!skipable ? (
          <Pressable
            accessibilityLabel="Назад"
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons
              name="arrow-back"
              size={25}
              color={theme.secondary}
            />
          </Pressable>
        ) : (
          <View />
        )}
        <Text style={[styles.brand, { color: theme.secondary }]}>foodler</Text>
        <View style={styles.topSpacer} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* {image} */}
          <Image
            source={basket}
            style={styles.basket}
            accessibilityLabel="Корзина Foodler"
          />
          <Text style={[styles.eyebrow, { color: theme.primary }]}>
            {skipable
              ? "ДОБРО ПОЖАЛОВАТЬ"
              : step === "code"
                ? "ПОЧТА ПОДТВЕРЖДЕНИЯ"
                : "ВАШИ ПОКУПКИ — В ПОРЯДКЕ"}
          </Text>
          {/* <Text style={[styles.heading, { color: theme.secondary }]}>
            {skipable
              ? "Начнём с важного"
              : step === "code"
                ? "Проверьте почту"
                : "Войдите в Foodler"}
          </Text> */}
          <Text style={[styles.lead, { color: theme.muted }]}>
            {skipable
              ? "Примите документы, чтобы продолжить пользоваться приложением."
              : step === "code"
                ? `Мы отправили код на ${email}.`
                : "Сохраняйте покупки на и синхронизируйте их между своими устройствами."}
          </Text>
          {step === "credentials" && !skipable ? (
            <View style={styles.form}>
              {field("Email", "email", email, (value) =>
                update("email", value),
              )}
              {field(
                "Пароль",
                "lock-outline",
                password,
                (value) => update("password", value),
                true,
              )}
              {error ? (
                <Text style={[styles.error, { color: theme.error }]}>
                  {error}
                </Text>
              ) : null}
              {button("Получить код", () => void send(), loading)}
              <Pressable
                onPress={() => navigation.navigate("ForgotPassword")}
                style={styles.link}
              >
                <Text style={[styles.linkText, { color: theme.muted }]}>
                  Забыли пароль?
                </Text>
              </Pressable>
            </View>
          ) : null}
          {step === "credentials" && skipable ? (
            <View
              style={[
                styles.policyCard,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              {POLICY_ENTRIES.map((entry) => (
                <View key={entry.key} style={styles.policyRow}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: accepted[entry.key] }}
                    onPress={() =>
                      setAccepted((old) => ({
                        ...old,
                        [entry.key]: !old[entry.key],
                      }))
                    }
                    style={[
                      styles.checkbox,
                      {
                        borderColor: theme.secondary,
                        backgroundColor: accepted[entry.key]
                          ? theme.primary
                          : "transparent",
                      },
                    ]}
                  >
                    {accepted[entry.key] ? (
                      <MaterialIcons
                        name="check"
                        size={15}
                        color={theme.white}
                      />
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      Linking.openURL(policy[entry.key]).catch(() =>
                        Alert.alert("Ошибка", "Не удалось открыть ссылку"),
                      )
                    }
                    style={styles.policyText}
                  >
                    <Text
                      style={[styles.policyLink, { color: theme.secondary }]}
                    >
                      {entry.label}
                    </Text>
                  </Pressable>
                </View>
              ))}
              {button(
                "Продолжить",
                () => void acceptPolicies(),
                loading || !allAccepted,
              )}
              <Pressable
                disabled={!allAccepted}
                onPress={() => void acceptPolicies()}
                style={styles.guestLink}
              >
                <Text
                  style={[
                    styles.linkText,
                    { color: theme.muted, opacity: allAccepted ? 1 : 0.45 },
                  ]}
                >
                  Продолжить без аккаунта
                </Text>
              </Pressable>
            </View>
          ) : null}
          {step === "code" ? (
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.secondary }]}>
                  Код подтверждения
                </Text>
                <View
                  style={[
                    styles.inputShell,
                    {
                      backgroundColor: theme.surface,
                      borderColor: error ? theme.error : theme.border,
                    },
                  ]}
                >
                  <MaterialIcons
                    name="mark-email-read"
                    size={20}
                    color={theme.secondary}
                  />
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    placeholder="abcd1234"
                    placeholderTextColor={theme.muted}
                    autoCapitalize="none"
                    autoFocus
                    maxLength={8}
                    style={[styles.input, { color: theme.text }]}
                  />
                </View>
                {error ? (
                  <Text style={[styles.error, { color: theme.error }]}>
                    {error}
                  </Text>
                ) : null}
              </View>
              {button("Подтвердить", () => void verify(), loading)}
              <Pressable
                onPress={() => setStep("credentials")}
                style={styles.link}
              >
                <Text style={[styles.linkText, { color: theme.secondary }]}>
                  Изменить данные
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboard: { flex: 1 },
  topbar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  topSpacer: { width: 25 },
  brand: {
    fontFamily: "serif",
    fontSize: 25,
    fontWeight: "700",
    letterSpacing: -1,
  },
  content: { padding: 24, paddingBottom: 48 },
  basket: {
    alignSelf: "center",
    height: 112,
    marginBottom: 8,
    resizeMode: "contain",
    width: 112,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 8,
  },
  heading: {
    fontFamily: "serif",
    fontSize: 39,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 43,
    marginTop: 8,
  },
  lead: { fontFamily: "serif", fontSize: 16, lineHeight: 23, marginTop: 12 },
  form: { marginTop: 30 },
  field: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  inputShell: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 15 },
  passwordToggle: { padding: 8 },
  error: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  cta: {
    alignItems: "center",
    borderRadius: 17,
    // borderWidth: 1.5,
    marginTop: 6,
    paddingVertical: 16,
  },
  ctaText: { fontSize: 16, fontWeight: "800" },
  link: { alignSelf: "center", padding: 16 },
  linkText: { fontSize: 15, fontWeight: "400" },
  policyCard: { borderRadius: 22, borderWidth: 1, marginTop: 28, padding: 18 },
  policyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  checkbox: {
    alignItems: "center",
    borderRadius: 5,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  policyText: { flex: 1 },
  policyLink: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
    textDecorationLine: "underline",
  },
  guestLink: { alignSelf: "center", paddingTop: 18 },
});
