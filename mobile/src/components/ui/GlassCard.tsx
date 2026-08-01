import React from "react";
import { ViewStyle, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "../ThemeContext";

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  delay?: number;
  blur?: boolean;
}

export function GlassCard({
  children,
  style,
  delay = 0,
  blur = true,
}: GlassCardProps) {
  const { theme } = useTheme();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      opacity.value = withSpring(1, {
        damping: 20,
        stiffness: 100,
      });
      translateY.value = withSpring(0, {
        damping: 20,
        stiffness: 100,
      });
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.glass,
        {
          backgroundColor: theme.glassBg || theme.surface,
          borderColor: theme.glassBorder || theme.border,
        },
        style,
        animatedStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
  },
});
