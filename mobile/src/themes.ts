export interface Theme {
  bg: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  card2: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  error: string;
  danger: string;
  outline: string;
  shadow: string;
  white: string;
  accent?: string;
  accent2?: string;
  glassBg?: string;
  glassBorder?: string;
}

export type ThemeName =
  | "light"
  | "dark"
  | "light-groovebox"
  | "dark-groovebox"
  | "ultra-dark"
  | "dark-rainbow"
  | "light-rainbow";

export const availableThemes: ThemeName[] = [
  "light",
  "dark",
  "light-groovebox",
  "dark-groovebox",
  "ultra-dark",
  "dark-rainbow",
  "light-rainbow",
];

export const themes: Record<ThemeName, Theme> = {
  light: {
    bg: "#F5F5F7",
    surface: "#FFFFFF",
    surfaceElevated: "#F2F2F5",
    card: "#FFFFFF",
    card2: "#FAFAFC",
    border: "#E8E8ED",
    text: "#1C1C1E",
    muted: "#8E8E93",

    primary: "#007AFF",
    primaryContainer: "#E8F2FF",
    onPrimaryContainer: "#0040A0",

    secondary: "#5856D6",

    error: "#FF3B30",
    danger: "#FF3B30",

    outline: "#C7C7CC",
    shadow: "#000000",
    white: "#FFFFFF",

    accent: "#34C759",
    accent2: "#FF9500",

    glassBg: "rgba(255, 255, 255, 0.7)",
    glassBorder: "rgba(255, 255, 255, 0.3)",
  },

  dark: {
    bg: "#0C0C0E",
    surface: "#1C1C1E",
    surfaceElevated: "#2C2C2E",
    card: "#1C1C1E",
    card2: "#222226",
    border: "#38383A",
    text: "#F5F5F7",
    muted: "#98989D",

    primary: "#0A84FF",
    primaryContainer: "#1A3A6A",
    onPrimaryContainer: "#D6EAFF",

    secondary: "#5E5CE6",

    error: "#FF453A",
    danger: "#FF453A",

    outline: "#48484A",
    shadow: "#000000",
    white: "#FFFFFF",

    accent: "#30D158",
    accent2: "#FF9F0A",

    glassBg: "rgba(28, 28, 30, 0.7)",
    glassBorder: "rgba(255, 255, 255, 0.08)",
  },

  // Revolut-inspired
  "light-groovebox": {
    bg: "#F0F2F5",
    surface: "#FFFFFF",
    surfaceElevated: "#F5F7FA",
    card: "#FFFFFF",
    card2: "#F8F9FB",
    border: "#E4E7EC",
    text: "#101214",
    muted: "#667085",

    primary: "#3758F9",
    primaryContainer: "#EEF0FF",
    onPrimaryContainer: "#1A2E8A",

    secondary: "#7C3AED",

    error: "#DC2626",
    danger: "#DC2626",

    outline: "#D0D5DD",
    shadow: "#000000",
    white: "#FFFFFF",

    accent: "#22C55E",
    accent2: "#F59E0B",

    glassBg: "rgba(255, 255, 255, 0.6)",
    glassBorder: "rgba(255, 255, 255, 0.3)",
  },

  // Coinbase-inspired dark
  "dark-groovebox": {
    bg: "#0A0B0D",
    surface: "#141519",
    surfaceElevated: "#1E2028",
    card: "#141519",
    card2: "#1A1C24",
    border: "#2A2D3A",
    text: "#F5F7FA",
    muted: "#8B8FA3",

    primary: "#0052FF",
    primaryContainer: "#1A3A7A",
    onPrimaryContainer: "#D6EAFF",

    secondary: "#7C5CFC",

    error: "#F87171",
    danger: "#F87171",

    outline: "#3B3F4F",
    shadow: "#000000",
    white: "#FFFFFF",

    accent: "#34D399",
    accent2: "#FBBF24",

    glassBg: "rgba(20, 21, 25, 0.7)",
    glassBorder: "rgba(255, 255, 255, 0.06)",
  },

  // OLED Black
  "ultra-dark": {
    bg: "#000000",
    surface: "#0D0D0F",
    surfaceElevated: "#161618",
    card: "#0D0D0F",
    card2: "#121214",
    border: "#1F1F23",
    text: "#F5F5F5",
    muted: "#86868B",

    primary: "#0A84FF",
    primaryContainer: "#1A3A6A",
    onPrimaryContainer: "#D6EAFF",

    secondary: "#5E5CE6",

    error: "#FF453A",
    danger: "#FF453A",

    outline: "#38383A",
    shadow: "#000000",
    white: "#FFFFFF",

    accent: "#30D158",
    accent2: "#FF9F0A",

    glassBg: "rgba(13, 13, 15, 0.7)",
    glassBorder: "rgba(255, 255, 255, 0.05)",
  },

  // Airbnb-inspired
  "dark-rainbow": {
    bg: "#0B0D0E",
    surface: "#16181A",
    surfaceElevated: "#1E2124",
    card: "#16181A",
    card2: "#1C1F22",
    border: "#2C2F33",
    text: "#F5F5F7",
    muted: "#8E8E93",

    primary: "#FF385C",
    primaryContainer: "#3A1A24",
    onPrimaryContainer: "#FFD6DE",

    secondary: "#00A699",

    error: "#FF453A",
    danger: "#FF453A",

    outline: "#404245",
    shadow: "#000000",
    white: "#FFFFFF",

    accent: "#FF385C",
    accent2: "#FBBF24",

    glassBg: "rgba(22, 24, 26, 0.7)",
    glassBorder: "rgba(255, 255, 255, 0.06)",
  },

  // Airbnb-inspired light
  "light-rainbow": {
    bg: "#F7F7F7",
    surface: "#FFFFFF",
    surfaceElevated: "#F5F5F5",
    card: "#FFFFFF",
    card2: "#FAFAFA",
    border: "#DDDDDD",
    text: "#222222",
    muted: "#717171",

    primary: "#FF385C",
    primaryContainer: "#FFF0F2",
    onPrimaryContainer: "#8A1A30",

    secondary: "#00A699",

    error: "#DC2626",
    danger: "#DC2626",

    outline: "#C7C7C7",
    shadow: "#000000",
    white: "#FFFFFF",

    accent: "#FF385C",
    accent2: "#22C55E",

    glassBg: "rgba(255, 255, 255, 0.7)",
    glassBorder: "rgba(255, 255, 255, 0.3)",
  },
};

export const defaultThemeName: ThemeName = "dark";

export function isDarkTheme(name: ThemeName): boolean {
  return ["dark", "dark-groovebox", "ultra-dark", "dark-rainbow"].includes(
    name,
  );
}
