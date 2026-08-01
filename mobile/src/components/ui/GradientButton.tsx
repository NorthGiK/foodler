import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

interface GradientButtonProps {
  title: string;
  onPress?: () => void;
  style?: ViewStyle;
  colors?: string[];
  size?: "sm" | "md" | "lg";
}

export function GradientButton({
  title,
  onPress,
  style,
  colors = ["#007AFF", "#5856D6"],
  size = "md",
}: GradientButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 12, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  const gradientColors = colors as [string, string, ...string[]];

  const paddingV = size === "sm" ? 10 : size === "lg" ? 18 : 14;
  const paddingH = size === "sm" ? 18 : size === "lg" ? 32 : 24;
  const fontSize = size === "sm" ? 14 : size === "lg" ? 18 : 16;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[animatedStyle, styles.wrapper, style]}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradient,
            { paddingVertical: paddingV, paddingHorizontal: paddingH },
          ]}
        >
          <Text style={[styles.text, { fontSize }]}>{title}</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    overflow: "hidden",
    alignSelf: "flex-start",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  gradient: {
    borderRadius: 16,
  },
  text: {
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
