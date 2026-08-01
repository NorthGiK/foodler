import { ShakeInput } from "@/components/ShakeInput";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { RootStackParamList } from "../../App";
import { api } from "../api/client";
import { useTheme } from "../components/ThemeContext";

type Step = "email" | "code" | "newPassword";

export function ForgotPasswordScreen() {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setStep("email");
    setEmail("");
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError("Введите email");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await api.forgotPasswordSendCode(email.trim());
      setStep("code");
    } catch (e: any) {
      const msg = e.message || "Не удалось отправить код";
      setError(msg);
      Alert.alert("Ошибка", msg);
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
      // Verify the code is valid before allowing password reset
      await api.forgotPasswordVerifyCode(email.trim(), code.trim(), "");
      setStep("newPassword");
    } catch (e: any) {
      const msg = e.message || "Неверный код";
      setError(msg);
      Alert.alert("Ошибка", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      setError("Пароль должен быть не менее 8 символов");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await api.forgotPasswordVerifyCode(email.trim(), code.trim(), newPassword);
      navigation.goBack();
      reset();
      Alert.alert("Успешно", "Пароль успешно изменен");
    } catch (e: any) {
      const msg = e.message || "Не удалось изменить пароль";
      setError(msg);
      Alert.alert("Ошибка", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>
          {step === "email"
            ? "Восстановление пароля"
            : step === "code"
              ? "Подтверждение"
              : "Новый пароль"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {step === "email" ? (
          <>
            <Text style={[styles.subtitle, { color: theme.muted }]}>
              Введите email, на который мы отправим код для сброса пароля.
            </Text>

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
              />

              <Pressable
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: theme.primary,
                    opacity: loading ? 0.6 : 1,
                  },
                ]}
                onPress={handleSendCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.white} />
                ) : (
                  <Text style={[styles.submitText, { color: theme.white }]}>
                    Отправить код
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        ) : step === "code" ? (
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
                onPress={() => setStep("email")}
                style={styles.backBtn}
              >
                <Text style={[styles.backText, { color: theme.muted }]}>
                  Назад
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: theme.muted }]}>
              Введите новый пароль.
            </Text>

            <View
              style={[
                styles.card,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <ShakeInput
                label="Новый пароль"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="••••••••"
                placeholderTextColor={theme.muted}
                secureTextEntry
                error={error}
              />

              <ShakeInput
                label="Подтвердите пароль"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                placeholderTextColor={theme.muted}
                secureTextEntry
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
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.white} />
                ) : (
                  <Text style={[styles.submitText, { color: theme.white }]}>
                    Изменить пароль
                  </Text>
                )}
              </Pressable>

              <Pressable onPress={() => setStep("code")} style={styles.backBtn}>
                <Text style={[styles.backText, { color: theme.muted }]}>
                  Назад
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
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
});