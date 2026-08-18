import { StyleSheet, Text, View } from "react-native";
import { Theme } from "../themes";
import { useTheme } from "./ThemeContext";
import { AnimatedPressable } from "./animations";

interface Props<T extends string> {
  value: T;
  items: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({
  value,
  items,
  onChange,
}: Props<T>) {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <AnimatedPressable
          key={item.value}
          onPress={() => onChange(item.value)}
          style={[styles.chip, value === item.value && styles.chipActive]}
        >
          <Text
            style={[styles.text, value === item.value && styles.textActive]}
          >
            {item.label}
          </Text>
        </AnimatedPressable>
      ))}
    </View>
  );
}

const getStyles = (theme: Theme) => {
  return StyleSheet.create({
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: theme.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    chipActive: {
      backgroundColor: theme.primaryContainer,
      borderColor: theme.primary,
    },
    text: { color: theme.text, fontWeight: "500", fontSize: 13 },
    textActive: { color: theme.onPrimaryContainer, fontWeight: "600" },
  });
};
