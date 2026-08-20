import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";

import type { RootStackParamList } from "../../../App";
import { useAuth } from "@/api/auth";
import { useTheme } from "../ThemeContext";
import { AnimatedPressable } from "../animations";
import { getAccountTheme } from "./accountTheme";

export function SubscriptionButton() {
  const { theme, themeName } = useTheme();
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
      <View style={[styles.button, { backgroundColor: accountTheme.proCard }]}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: accountTheme.text }]}>
            Подписка PRO
          </Text>
          <Text style={[styles.caption, { color: accountTheme.muted }]}>
            Расширенная аналитика и персональные советы
          </Text>
        </View>
        <View style={[styles.cta, { backgroundColor: accountTheme.accent }]}>
          <Text style={[styles.ctaText, { color: accountTheme.accentText }]}>
            Подписаться
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "stretch",
    marginBottom: 16,
  },
  button: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 21,
    fontWeight: "700",
  },
  caption: {
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
