import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";

import type { RootStackParamList } from "../../../App";
import { useAuth } from "@/api/auth";
import { useTheme } from "../ThemeContext";
import { AnimatedPressable } from "../animations";

export function SubscriptionButton() {
  const { theme } = useTheme();
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
      <View
        style={[
          styles.button,
          { backgroundColor: theme.accent, borderColor: theme.primary },
        ]}
      >
        <View
          style={[styles.icon, { backgroundColor: theme.primaryContainer }]}
        >
          <MaterialIcons
            name="auto-awesome"
            size={22}
            color={theme.onPrimaryContainer}
          />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.white }]}>Подписка</Text>
          <Text style={[styles.caption, { color: theme.white }]}>
            Больше возможностей Foodler
          </Text>
        </View>
        <MaterialIcons name="arrow-forward" size={22} color={theme.white} />
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
  icon: {
    alignItems: "center",
    borderRadius: 14,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontFamily: "serif",
    fontSize: 19,
    fontWeight: "700",
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    opacity: 0.86,
  },
});
