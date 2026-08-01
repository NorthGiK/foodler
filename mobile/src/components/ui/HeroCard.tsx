import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { AnimatedPressable } from "../animations/AnimatedPressable";
import { useTheme } from "../ThemeContext";
import AnimatedGlow from "react-native-animated-glow";

interface HeroCardProps {
  title: string;
  subtitle: string;
  icon: string;
  iconColor?: string;
  onPress: () => void;
  style?: ViewStyle;
  gradient?: boolean;
}

export function HeroCard({
  title,
  subtitle,
  icon,
  iconColor = "#007AFF",
  onPress,
  style,
  gradient = false,
}: HeroCardProps) {
  const { theme } = useTheme();

  return (
    <AnimatedPressable scaleTo={0.97} onPress={onPress} style={style}>
      <AnimatedGlow
        preset={{
          cornerRadius: styles.card.borderRadius,
          outlineWidth: 0,
          animationSpeed: 0.2,
          borderSpeedMultiplier: 1,
          glowLayers: [
            {
              colors: ["#43a4ff", "#FF00FF", "#00FFFF"],
              glowSize: 3,
              opacity: 0.6,
            },
          ],
        }}
        style={{ flex: 1 }}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: gradient
                ? iconColor + "15"
                : theme.primaryContainer,
              borderColor: iconColor + "30",
              shadowColor: iconColor,
            },
          ]}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: iconColor + "20" },
            ]}
          >
            <View
              style={[styles.iconGlow, { backgroundColor: iconColor + "10" }]}
            />
            <MaterialIcons name={icon as any} size={32} color={iconColor} />
          </View>
          <View style={styles.textContainer}>
            <Text
              style={[
                styles.title,
                { color: gradient ? theme.text : theme.onPrimaryContainer },
              ]}
            >
              {title}
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: gradient ? theme.muted : theme.onPrimaryContainer },
              ]}
            >
              {subtitle}
            </Text>
          </View>
          <View
            style={[
              styles.chevronContainer,
              { backgroundColor: iconColor + "15" },
            ]}
          >
            <MaterialIcons name="chevron-right" size={22} color={iconColor} />
          </View>
        </View>
      </AnimatedGlow>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    padding: 18,
    gap: 14,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  iconGlow: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    transform: [{ scale: 1.5 }],
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.8,
  },
  chevronContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
});
