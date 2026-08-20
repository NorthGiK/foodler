import MaterialIcons from "@react-native-vector-icons/material-icons";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { AiActionType } from "../../ai/types";
import { AnimatedPressable } from "../animations/AnimatedPressable";
import type { MaterialIconName } from "../icons";
import { useTheme } from "../ThemeContext";

interface ReportCardProps {
  title: string;
  date: string;
  action: AiActionType;
  pinned?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

const actionColors: Record<AiActionType, string> = {
  analysis: "#fabd2f",
  save_money: "#D5663D",
  health: "#8ec07c",
  recipe: "#C56A47",
  cart: "#D69B21",
  ingredients: "#5B6875",
  habits: "#C8813B",
  diet: "#587448",
  ask: "#C44935",
};

const actionIcons: Record<AiActionType, MaterialIconName> = {
  analysis: "analytics",
  save_money: "sell",
  health: "spa",
  recipe: "soup-kitchen",
  cart: "shopping-bag",
  ingredients: "science",
  habits: "schedule",
  diet: "restaurant-menu",
  ask: "chat",
};

export function ReportCard({
  title,
  date,
  action,
  pinned,
  onPress,
  style,
}: ReportCardProps) {
  const { theme } = useTheme();
  const color = actionColors[action] || theme.primary;
  const icon = actionIcons[action] || "analytics";

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Отчёт: ${title}`}
      scaleTo={0.99}
      onPress={onPress}
      style={style}
    >
      <View
        style={[
          styles.row,
          {
            borderColor: theme.border,
          },
        ]}
      >
        <View style={[styles.ribbon, { backgroundColor: color }]} />
        <View style={styles.iconContainer}>
          <MaterialIcons name={icon} size={22} color={color} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.date, { color: theme.muted }]}>{date}</Text>
        </View>
        <View
          accessibilityLabel={pinned ? "Закреплено" : "Не закреплено"}
          style={styles.pinBadge}
        >
          <MaterialIcons
            name={pinned ? "push-pin" : "bookmark-border"}
            size={18}
            color={pinned ? color : theme.muted}
          />
        </View>
        <MaterialIcons name="chevron-right" size={20} color={theme.muted} />
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 70,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  ribbon: {
    width: 3,
    height: 42,
    borderRadius: 2,
    marginRight: 14,
  },
  iconContainer: {
    width: 34,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
  },
  pinBadge: {
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
});
