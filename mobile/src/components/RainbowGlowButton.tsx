import React, { useState } from "react";
import { StyleSheet, Text, Pressable, View, ViewStyle } from "react-native";
import AnimatedGlow, { type GlowEvent } from "react-native-animated-glow";
import { useTheme } from "./ThemeContext";
import { Theme } from "@/themes";
import { AnimatedPressable } from "./animations";

type Props = {
  title: string;
  onPress?: () => void;
  style?: ViewStyle;
  variant?: "rainbow" | "primary" | "premium";
  icon?: string;
};

export function RainbowGlowButton({
  title,
  onPress,
  style,
  variant = "rainbow",
  icon,
}: Props) {
  const [glowState, setGlowState] = useState<GlowEvent>("default");
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme);

  const getPreset = () => {
    if (variant === "primary") {
      return {
        cornerRadius: 100,
        outlineWidth: 0,
        animationSpeed: 0,
        borderSpeedMultiplier: 1,
        glowLayers: [
          {
            colors: [theme.primary],
            glowSize: 10,
            opacity: 0.3,
          },
        ],
      };
    }
    if (variant === "premium") {
      return {
        cornerRadius: 100,
        outlineWidth: 0,
        animationSpeed: 1.2,
        borderSpeedMultiplier: 1,
        glowLayers: [
          {
            colors: [
              "#FFD700",
              "#FFA500",
              "#FF69B4",
              "#9370DB",
              "#00BFFF",
              "#FFD700",
            ],
            glowSize: 12,
            opacity: 0.6,
          },
        ],
      };
    }
    // Default rainbow
    return {
      cornerRadius: 100,
      outlineWidth: 0,
      animationSpeed: 1.2,
      borderSpeedMultiplier: 1,
      glowLayers: [
        {
          colors: [
            "#FF0000",
            "#00FF00",
            "#0000FF",
            "#FFFF00",
            "#FF00FF",
            "#00FFFF",
            "#FF0000",
          ],
          glowSize: 15,
          opacity: 0.8,
        },
      ],
    };
  };

  const renderContent = () => {
    if (icon) {
      return (
        <View style={styles.buttonWithIcon}>
          <Text style={styles.buttonText}>{title}</Text>
        </View>
      );
    }
    return <Text style={styles.buttonText}>{title}</Text>;
  };

  return (
    <View style={[styles.container, style]}>
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => setGlowState("press")}
        onPressOut={() => setGlowState("default")}
        onHoverIn={() => setGlowState("hover")}
        onHoverOut={() => setGlowState("default")}
      >
        <AnimatedGlow preset={getPreset()} activeState={glowState}>
          <View
            style={[
              styles.button,
              {
                backgroundColor:
                  themeName === "dark" ? theme.surface : theme.white,
              },
            ]}
          >
            {renderContent()}
          </View>
        </AnimatedGlow>
      </AnimatedPressable>
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      alignSelf: "center",
    },
    button: {
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 100,
      justifyContent: "center",
      alignItems: "center",
    },
    buttonWithIcon: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    buttonText: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
  });
