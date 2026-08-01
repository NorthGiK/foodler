import React, { useState } from "react";
import { View, Text, StyleSheet, Alert, Linking } from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../../../App";
import { useAuth } from "@/api/auth";
import { api } from "@/api/client";

import { useTheme } from "../ThemeContext";
import { RainbowGlowButton } from "../RainbowGlowButton";

const SUBSCRIPTION_FEATURES = [
  { icon: "auto-awesome", text: "Увеличенный доступ к AI-помощнику" },
  { icon: "inventory", text: "Бессрочное серверное хранение новых чеков" },
] as const;

interface PremiumCardProps {
  isPremium: boolean;
  subscriptionExpires?: string;
}

export function PremiumCard({
  isPremium,
  subscriptionExpires,
}: PremiumCardProps) {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isAuthenticated } = useAuth();
  const [processing, setProcessing] = useState(false);

  const purchase = async () => {
    if (processing) return;
    if (!isAuthenticated) {
      navigation.navigate("Login");
      return;
    }

    setProcessing(true);
    try {
      const purchaseUrl = await api.makePurchase();
      if (!purchaseUrl) {
        Alert.alert("Ошибка", "Технические неполадки с сервером");
        return;
      }

      await Linking.openURL(purchaseUrl);
    } catch (e) {
      console.warn("Failed to open subscription payment", e);
      Alert.alert("Ошибка", "Не удалось открыть страницу оплаты");
    } finally {
      setProcessing(false);
    }
  };

  if (isPremium) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.primary + "10",
            borderColor: theme.primary + "30",
          },
        ]}
      >
        <View style={styles.header}>
          <View
            style={[styles.icon, { backgroundColor: theme.primary + "20" }]}
          >
            <MaterialIcons name="star" size={24} color={theme.primary} />
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: theme.text }]}>Premium</Text>
            {subscriptionExpires && (
              <Text style={[styles.subtitle, { color: theme.muted }]}>
                До {new Date(subscriptionExpires).toLocaleDateString("ru-RU")}
              </Text>
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: theme.primary }]}>
            <Text style={[styles.badgeText, { color: theme.white }]}>
              Активна
            </Text>
          </View>
        </View>

        <View style={styles.featuresList}>
          {SUBSCRIPTION_FEATURES.map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <MaterialIcons
                name="check-circle"
                size={16}
                color={theme.primary}
              />
              <Text style={[styles.featureText, { color: theme.text }]}>
                {feature.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.promoCard,
        {
          backgroundColor: theme.primary + "12",
          borderColor: theme.primary + "35",
        },
      ]}
    >
      <View style={styles.header}>
        <View
          style={[styles.promoIcon, { backgroundColor: theme.primary + "22" }]}
        >
          <MaterialIcons name="star" size={28} color={theme.primary} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: theme.text }]}>
            Food Tracker Premium
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Откройте все возможности приложения
          </Text>
        </View>
      </View>

      <View style={styles.featuresList}>
        {SUBSCRIPTION_FEATURES.map((feature, i) => (
          <View key={i} style={styles.featureRow}>
            <MaterialIcons
              name={feature.icon}
              size={16}
              color={theme.primary}
            />
            <Text style={[styles.featureText, { color: theme.text }]}>
              {feature.text}
            </Text>
          </View>
        ))}
      </View>

      <RainbowGlowButton
        title={processing ? "Открываем оплату…" : "Оформить подписку"}
        variant="premium"
        onPress={purchase}
      />

      <Text style={[styles.promoNote, { color: theme.muted }]}>
        Итоговая стоимость будет показана до подтверждения оплаты
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  promoCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  promoIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  featuresList: {
    gap: 10,
    marginBottom: 18,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureText: {
    fontSize: 14,
  },
  promoNote: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 12,
  },
  modalContainer: {
    padding: 20,
    paddingBottom: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalClose: {
    padding: 4,
  },
  methodsList: {
    gap: 10,
    paddingVertical: 6,
  },
  methodItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
  },
  methodIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  methodLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
