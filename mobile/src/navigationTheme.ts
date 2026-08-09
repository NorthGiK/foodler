import { DefaultTheme, type Theme } from "@react-navigation/native";
import type { Theme as FoodlerTheme } from "./themes";

export function createNavigationTheme(
  theme: FoodlerTheme,
  themeName: "light" | "dark",
): Theme {
  return {
    ...DefaultTheme,
    dark: themeName === "dark",
    colors: {
      ...DefaultTheme.colors,
      primary: theme.primary,
      background: theme.bg,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
      notification: theme.error,
    },
  };
}
