import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { Theme, themes, defaultThemeName } from "../themes";

interface ThemeContextValue {
  theme: Theme;
  themeName: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeName, setThemeName] = useState<"light" | "dark">(
    systemColorScheme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    setThemeName(systemColorScheme === "dark" ? "dark" : "light");
  }, [systemColorScheme]);

  const theme = themes[themeName] || themes[defaultThemeName];

  return (
    <ThemeContext.Provider value={{ theme, themeName }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
