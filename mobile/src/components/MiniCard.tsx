import { StyleSheet, Text, View } from "react-native";
import { Theme } from "@/themes";
import { useTheme } from "./ThemeContext";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import type { MaterialIconName } from "./icons";

export function MiniCard({
  title,
  value,
  hint,
  icon,
  color,
}: {
  title: string;
  value: string;
  hint?: string;
  icon?: MaterialIconName;
  color?: string;
}) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const iconColor = color || theme.primary;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: 1,
        },
      ]}
    >
      {icon && (
        <View style={[styles.iconWrap, { backgroundColor: iconColor + "15" }]}>
          <MaterialIcons name={icon} size={20} color={iconColor} />
        </View>
      )}
      <Text style={[styles.title, { color: theme.muted }]}>{title}</Text>
      <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
      {hint ? (
        <Text style={[styles.hint, { color: theme.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const getStyles = (theme: Theme) => {
  function shadow(e: number) {
    return {
      elevation: e,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: e / 2 },
      shadowOpacity: 0.1,
      shadowRadius: e,
    };
  }

  return StyleSheet.create({
    card: {
      flex: 1,
      borderRadius: 20,
      padding: 16,
      gap: 8,
      ...shadow(2),
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 4,
    },
    title: { fontSize: 13, fontWeight: "500" },
    value: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
    hint: { fontSize: 12, marginTop: 2 },
  });
};
