import { StyleSheet, Text, View, Image } from "react-native";
import { useTheme } from "../ThemeContext";
import { Theme } from "@/themes";

const ICON = require("@/assets/FoodlerIcon.png") as number;

export default function LogoBrand() {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  return (
    <View style={styles.container}>
      <Image source={ICON} style={{ height: 50, width: 50 }} />
      <Text style={[styles.brand, { color: theme.text }]}>FOODLER</Text>
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    brand: {
      fontFamily: "serif",
      fontSize: 20,
      color: theme.text,
      fontWeight: "500",
      letterSpacing: 0.2,
    },
  });
