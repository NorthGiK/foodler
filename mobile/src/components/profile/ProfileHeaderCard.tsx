import React from "react";
import { View, Text, StyleSheet } from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useTheme } from "../ThemeContext";
import { AnimatedPressable } from "../animations";

interface ProfileHeaderCardProps {
  email: string;
  isPremium: boolean;
  subscriptionExpires?: string;
  onLoginPress?: () => void;
}

export function ProfileHeaderCard({
  email,
  isPremium,
  subscriptionExpires,
  onLoginPress,
}: ProfileHeaderCardProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View
        style={[styles.avatar, { backgroundColor: theme.primaryContainer }]}
      >
        <MaterialIcons
          name="person"
          size={36}
          color={theme.onPrimaryContainer}
        />
      </View>

      <Text style={[styles.email, { color: theme.text }]}>{email}</Text>

      {isPremium && (
        <View style={[styles.premiumBadge, { backgroundColor: theme.primary }]}>
          <MaterialIcons name="star" size={14} color={theme.white} />
          <Text style={[styles.premiumText, { color: theme.white }]}>
            Premium
          </Text>
        </View>
      )}
      {subscriptionExpires && (
        <Text style={[styles.subscriptionInfo, { color: theme.muted }]}>
          Подписка активна до{" "}
          {new Date(subscriptionExpires).toLocaleDateString("ru-RU")}
        </Text>
      )}
    </View>
  );
}

export function ProfileGuestCard({
  onLoginPress,
}: {
  onLoginPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View
        style={[
          styles.avatarLarge,
          { backgroundColor: theme.primary + "15" },
        ]}
      >
        <MaterialIcons
          name="person-outline"
          size={48}
          color={theme.primary}
        />
      </View>
      <Text style={[styles.subtitle, { color: theme.text }]}>
        Войдите, чтобы синхронизировать данные и получить доступ ко всем
        функциям
      </Text>
      <AnimatedPressable scaleTo={0.97} onPress={onLoginPress}>
        <View
          style={[styles.loginButton, { backgroundColor: theme.primary }]}
        >
          <MaterialIcons name="login" size={20} color={theme.white} />
          <Text style={[styles.loginButtonText, { color: theme.white }]}>
            Войти
          </Text>
        </View>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: "center",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  email: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  loginButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  premiumText: {
    fontSize: 14,
    fontWeight: "700",
  },
  subscriptionInfo: {
    fontSize: 13,
    marginTop: 8,
  },
});