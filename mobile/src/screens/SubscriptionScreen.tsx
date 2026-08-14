import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { RootStackParamList } from "../../App";
import { analyticsEvents } from "@/analytics/facade";
import { api, type SubscriptionPlan } from "@/api/client";
import { useAuth } from "@/api/auth";
import { AnimatedPressable } from "@/components/animations";
import { useTheme } from "@/components/ThemeContext";
import { SUBSCRIPTION_TERMS } from "@/config";
import {
  SUBSCRIPTION_PLANS,
  subscriptionActionLabel,
} from "@/subscriptionPlans";

type SubscriptionStatus = {
  active: boolean;
  plan: SubscriptionPlan | null;
  expiresAt: string | null;
};

function formatExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU");
}

export function SubscriptionScreen() {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isAuthenticated, refreshUser } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [processingPlan, setProcessingPlan] = useState<SubscriptionPlan | null>(
    null,
  );

  const loadStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(false);
    try {
      const result = await api.getSubscription();
      setStatus({
        active: result.active,
        plan: result.active ? (result.plan ?? null) : null,
        expiresAt: result.active ? result.expiresAt : null,
      });
      await refreshUser();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, refreshUser]);

  useEffect(() => {
    if (!isAuthenticated) navigation.replace("Login");
  }, [isAuthenticated, navigation]);

  useFocusEffect(
    useCallback(() => {
      void analyticsEvents.subscriptionScreenViewed();
      void loadStatus();
    }, [loadStatus]),
  );

  const purchase = async (plan: SubscriptionPlan) => {
    if (processingPlan) return;
    void analyticsEvents.subscriptionPlan(plan);
    setProcessingPlan(plan);
    try {
      const purchaseUrl = await api.makePurchase(plan);
      if (!purchaseUrl) {
        void analyticsEvents.checkoutFailed(plan, new Error("unavailable"));
        Alert.alert("Ошибка", "Не удалось получить страницу оплаты.");
        return;
      }
      await Linking.openURL(purchaseUrl);
      void analyticsEvents.checkoutOpened(plan);
    } catch (error: unknown) {
      void analyticsEvents.checkoutFailed(plan, error);
      Alert.alert("Ошибка", "Не удалось открыть страницу оплаты.");
    } finally {
      setProcessingPlan(null);
    }
  };

  const openSubscriptionTerms = async () => {
    try {
      await Linking.openURL(SUBSCRIPTION_TERMS);
      void analyticsEvents.subscriptionTermsViewed();
    } catch {
      Alert.alert("Ошибка", "Не удалось открыть условия подписки.");
    }
  };

  const activePlan = status?.active ? status.plan : null;
  const expiry = status?.active ? formatExpiry(status.expiresAt) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <AnimatedPressable
          accessibilityLabel="Назад в профиль"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={theme.text} />
        </AnimatedPressable>
        <Text style={[styles.heading, { color: theme.text }]}>Подписка</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[styles.stateText, { color: theme.muted }]}>
            Загружаем тарифы…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <MaterialIcons name="error-outline" size={32} color={theme.error} />
          <Text style={[styles.stateText, { color: theme.text }]}>
            Не удалось загрузить статус подписки
          </Text>
          <AnimatedPressable
            onPress={() => void loadStatus()}
            style={[styles.retryButton, { borderColor: theme.border }]}
          >
            <Text style={[styles.retryText, { color: theme.primary }]}>
              Повторить
            </Text>
          </AnimatedPressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: theme.muted }]}>
            Выберите подходящий уровень поддержки Foodler
          </Text>

          {activePlan && (
            <View
              style={[
                styles.statusCard,
                {
                  backgroundColor: theme.primary + "14",
                  borderColor: theme.primary + "40",
                },
              ]}
            >
              <MaterialIcons name="verified" size={18} color={theme.primary} />
              <Text style={[styles.statusText, { color: theme.text }]}>
                Активна{" "}
                {activePlan === "premium_monthly" ? "Premium" : "Базовая"}{" "}
                подписка{expiry ? ` до ${expiry}` : ""}
              </Text>
            </View>
          )}

          <View style={styles.planRow}>
            {SUBSCRIPTION_PLANS.map((plan) => {
              const premium = plan.id === "premium_monthly";
              const processing = processingPlan === plan.id;
              return (
                <View
                  key={plan.id}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: premium ? "#2D1648" : theme.card,
                      borderColor: premium ? "#C084FC" : theme.border,
                    },
                  ]}
                >
                  {premium && (
                    <LinearGradient
                      colors={["#8B5CF6", "#EC4899"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.premiumBadge}
                    >
                      <Text style={styles.premiumBadgeText}>ЛУЧШИЙ ВЫБОР</Text>
                    </LinearGradient>
                  )}
                  <MaterialIcons
                    name={premium ? "auto-awesome" : "star-outline"}
                    size={28}
                    color={premium ? "#F9A8D4" : theme.primary}
                  />
                  <Text
                    style={[
                      styles.planTitle,
                      { color: premium ? "#FFFFFF" : theme.text },
                    ]}
                  >
                    {plan.title}
                  </Text>
                  <Text
                    style={[
                      styles.price,
                      { color: premium ? "#F5D0FE" : theme.primary },
                    ]}
                  >
                    {plan.price}
                  </Text>
                  <View style={styles.featureList}>
                    {plan.features.map((feature) => (
                      <View key={feature} style={styles.featureRow}>
                        <MaterialIcons
                          name="check-circle"
                          size={16}
                          color={premium ? "#F0ABFC" : theme.primary}
                        />
                        <Text
                          style={[
                            styles.featureText,
                            { color: premium ? "#FDF4FF" : theme.text },
                          ]}
                        >
                          {feature}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <AnimatedPressable
                    disabled={processingPlan !== null}
                    onPress={() => void purchase(plan.id)}
                    style={[
                      styles.planButton,
                      {
                        backgroundColor: premium ? "#F9A8D4" : theme.primary,
                        opacity: processingPlan && !processing ? 0.55 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.planButtonText,
                        { color: premium ? "#3B0764" : theme.white },
                      ]}
                    >
                      {processing
                        ? "Открываем…"
                        : subscriptionActionLabel(plan.id, activePlan)}
                    </Text>
                  </AnimatedPressable>
                </View>
              );
            })}
          </View>
          <Text style={[styles.termsNotice, { color: theme.muted }]}>
            Продолжая оформление, вы соглашаетесь с{" "}
            <Text
              accessibilityRole="link"
              onPress={() => void openSubscriptionTerms()}
              style={styles.termsLink}
            >
              условиями подписки
            </Text>
            .
          </Text>

          <Text style={[styles.note, { color: theme.muted }]}>
            Итоговая стоимость будет показана до подтверждения оплаты.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  headerSpacer: { width: 40 },
  heading: { fontSize: 22, fontWeight: "800" },
  content: { padding: 20, paddingTop: 8, paddingBottom: 36 },
  intro: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 18,
    textAlign: "center",
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 18,
  },
  statusText: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  planRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  planCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    overflow: "hidden",
  },
  premiumBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginBottom: 12,
  },
  premiumBadgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  planTitle: { fontSize: 17, lineHeight: 21, fontWeight: "800", marginTop: 10 },
  price: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    marginTop: 6,
    marginBottom: 16,
  },
  featureList: { flex: 1, gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  featureText: { flex: 1, fontSize: 12, lineHeight: 17 },
  planButton: {
    alignItems: "center",
    borderRadius: 14,
    marginTop: 18,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  planButtonText: { fontSize: 12, fontWeight: "800", textAlign: "center" },
  note: { fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 20 },
  termsNotice: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 20,
    textAlign: "center",
  },
  termsLink: { color: "#38BDF8", textDecorationLine: "underline" },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  stateText: { textAlign: "center", fontSize: 15, lineHeight: 21 },
  retryButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryText: { fontWeight: "700", fontSize: 14 },
});
