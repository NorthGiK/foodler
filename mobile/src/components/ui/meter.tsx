import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../ThemeContext";

interface MeterProps {
  value: number;
  max: number;
  children?: React.ReactNode;
}

export function Meter({ value, max, children }: MeterProps) {
  const { theme } = useTheme();
  const progress = Math.max(0, Math.min(1, value / Math.max(1, max)));

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${progress * 100}%`,
              backgroundColor: theme.primary,
            },
          ]}
        />
      </View>
      {children}
    </View>
  );
}

export function MeterLabel({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <Text style={[styles.label, { color: theme.muted }]}>{children}</Text>;
}

export function MeterValue({ children }: { children?: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.value, { color: theme.text }]}>{children ?? ""}</Text>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
  },
  fill: {
    height: "100%",
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 4,
  },
  value: {
    fontSize: 24,
    fontWeight: "700",
  },
});
