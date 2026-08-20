import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/api/auth";
import type { Theme } from "@/themes";
import type { RootStackParamList } from "../../../App";
import { useTheme } from "../ThemeContext";
import { AnimatedPressable } from "../animations";
import { getAccountTheme } from "./accountTheme";

export function SubscriptionButton() {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme);
  const accountTheme = getAccountTheme(theme, themeName);
  const { isAuthenticated } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel="Открыть подписку"
      onPress={() =>
        navigation.navigate(isAuthenticated ? "Subscription" : "Login")
      }
      style={({ pressed }) => [styles.wrapper, { opacity: pressed ? 0.86 : 1 }]}
    >
      <View style={styles.button}>
        <View style={styles.copy}>
          <Text style={styles.title}>
            Подписка
          </Text>
          <Text style={styles.caption}>
            Расширенная аналитика и персональные советы
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  wrapper: {
    alignSelf: "stretch",
    backgroundColor: theme.accent3,
    borderRadius: 15,
    marginBottom: 16,
  },
  button: {
    alignItems: "center",
    borderRadius: 20,
    flexDirection: "row",
    gap: 18,
    minHeight: 76,
    paddingHorizontal: 26,
    paddingVertical: 24,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: theme.white,
    fontSize: 21,
    fontWeight: "700",
  },
  caption: {
    color: theme.text + "a0",
    fontSize: 13,
    lineHeight: 17,
    marginTop: 2,
    maxWidth: 195,
  },
  cta: {
    borderRadius: 23,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  ctaText: { fontSize: 14, fontWeight: "700" },
});
