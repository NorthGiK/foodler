import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { AnimatedPressable } from "../animations/AnimatedPressable";
import { useTheme } from "../ThemeContext";
import type { MaterialIconName } from "../icons";

interface AddButtonProps {
  title: string;
  icon?: MaterialIconName;
  onPress: () => void;
  style?: ViewStyle;
  variant?: "primary" | "secondary" | "ghost";
}

export function AddButton({
  title,
  icon = "add",
  onPress,
  style,
  variant = "primary",
}: AddButtonProps) {
  const { theme } = useTheme();

  if (variant === "ghost") {
    return (
      <AnimatedPressable scaleTo={0.97} onPress={onPress} style={style}>
        <View style={styles.ghostContainer}>
          <View
            style={[
              styles.ghostIconCircle,
              { backgroundColor: theme.primary + "15" },
            ]}
          >
            <MaterialIcons name={icon} size={20} color={theme.primary} />
          </View>
          <Text style={[styles.ghostTitle, { color: theme.text }]}>
            {title}
          </Text>
        </View>
      </AnimatedPressable>
    );
  }

  if (variant === "secondary") {
    return (
      <AnimatedPressable scaleTo={0.97} onPress={onPress} style={style}>
        <View
          style={[
            styles.secondaryCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View
            style={[
              styles.secondaryIconCircle,
              { backgroundColor: theme.primary + "15" },
            ]}
          >
            <MaterialIcons name={icon} size={28} color={theme.primary} />
          </View>
          <Text style={[styles.secondaryTitle, { color: theme.text }]}>
            {title}
          </Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.muted} />
        </View>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable scaleTo={0.97} onPress={onPress} style={style}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.primary,
            shadowColor: theme.primary,
          },
        ]}
      >
        <View style={styles.iconCircle}>
          <MaterialIcons name={icon} size={24} color={theme.white} />
        </View>
        <Text style={[styles.title, { color: theme.white }]}>{title}</Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  // Primary — Cash App style: pill with icon circle
  card: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 100,
    gap: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.3,
  },

  // Secondary — Wise style: card with icon
  secondaryCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  secondaryIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },

  // Ghost — transparent background, no card
  ghostContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ghostIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  ghostTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
});
