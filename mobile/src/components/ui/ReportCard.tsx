import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { AnimatedPressable } from "../animations/AnimatedPressable";
import { useTheme } from "../ThemeContext";
import { AiActionType } from "../../ai/types";
import type { MaterialIconName } from "../icons";

interface ReportCardProps {
  title: string;
  date: string;
  action: AiActionType;
  pinned?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

const actionColors: Record<AiActionType, string> = {
  analysis: "#007AFF",
  save_money: "#34C759",
  health: "#FF3B30",
  recipe: "#FF9500",
  cart: "#AF52DE",
  ingredients: "#007AFF",
  habits: "#5AC8FA",
  diet: "#34C759",
  ask: "#FF9500",
};

const actionIcons: Record<AiActionType, MaterialIconName> = {
  analysis: "analytics",
  save_money: "savings",
  health: "favorite",
  recipe: "restaurant",
  cart: "shopping-cart",
  ingredients: "science",
  habits: "insights",
  diet: "spa",
  ask: "chat",
};

export function ReportCard({
  title,
  date,
  action,
  pinned,
  onPress,
  style,
}: ReportCardProps) {
  const { theme } = useTheme();
  const color = actionColors[action] || "#007AFF";
  const icon = actionIcons[action] || "analytics";

  return (
    <AnimatedPressable scaleTo={0.98} onPress={onPress} style={style}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={[styles.iconContainer, { backgroundColor: color + "18" }]}>
          <MaterialIcons name={icon} size={22} color={color} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.date, { color: theme.muted }]}>{date}</Text>
        </View>
        {pinned && (
          <View style={[styles.pinBadge, { backgroundColor: color + "15" }]}>
            <MaterialIcons name="push-pin" size={14} color={color} />
          </View>
        )}
        <MaterialIcons name="chevron-right" size={20} color={theme.muted} />
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
  },
  pinBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
});
