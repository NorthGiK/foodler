import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { AnimatedPressable } from "../animations/AnimatedPressable";
import { useTheme } from "../ThemeContext";
import type { MaterialIconName } from "../icons";

interface ActionCardProps {
  title: string;
  icon: MaterialIconName;
  color: string;
  onPress: () => void;
  style?: ViewStyle;
  subtitle?: string;
}

export function ActionCard({
  title,
  icon,
  color,
  onPress,
  style,
  subtitle,
}: ActionCardProps) {
  const { theme } = useTheme();

  return (
    <AnimatedPressable scaleTo={0.95} onPress={onPress} style={style}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: color + "30",
          },
        ]}
      >
        <View style={[styles.iconContainer, { backgroundColor: color + "18" }]}>
          <View style={[styles.iconGlow, { backgroundColor: color + "10" }]} />
          <MaterialIcons name={icon} size={26} color={color} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {subtitle && (
          <Text
            style={[styles.subtitle, { color: theme.muted }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    borderWidth: 1.5,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    minHeight: 100,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    overflow: "hidden",
  },
  iconGlow: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    transform: [{ scale: 1.5 }],
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 15,
  },
});
