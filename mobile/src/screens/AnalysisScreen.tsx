import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useTheme } from "../components/ThemeContext";
import FullModalWindow from "@/components/FullModalWindow";
import { AiActionType } from "../ai/types";
import { ActionCard, HeroCard } from "@/components/ui";
import type { MaterialIconName } from "../components/icons";

type AnalysisProps = {
  analysisVisible: boolean;
  setAnalysisVisible: React.Dispatch<React.SetStateAction<boolean>>;
  onAction?: (action: AiActionType) => void;
};

interface AnalysisAction {
  icon: MaterialIconName;
  color: string;
  title: string;
  action: AiActionType;
}

export function AnalysisScreen({
  analysisVisible,
  setAnalysisVisible,
  onAction,
}: AnalysisProps) {
  const { theme } = useTheme();

  const handleAction = (action: AiActionType) => {
    setAnalysisVisible(false);
    onAction?.(action);
  };

  const cards: AnalysisAction[] = [
    {
      icon: "savings",
      color: "#34C759",
      title: "Экономия",
      action: "save_money",
    },
    {
      icon: "favorite",
      color: "#FF3B30",
      title: "Рацион",
      action: "diet",
    },
    {
      icon: "analytics",
      color: "#007AFF",
      title: "Привычки",
      action: "habits",
    },
    {
      icon: "shopping-cart",
      color: "#FF9500",
      title: "Корзина",
      action: "cart",
    },
  ];

  return (
    <FullModalWindow visible={analysisVisible} setVisible={setAnalysisVisible}>
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: theme.bg,
        }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text
            style={[
              styles.title,
              {
                color: theme.text,
              },
            ]}
          >
            Анализ
          </Text>
          <Pressable onPress={() => setAnalysisVisible(false)}>
            <View
              style={[
                styles.closeBtn,
                { backgroundColor: theme.surfaceElevated },
              ]}
            >
              <MaterialIcons name="close" size={22} color={theme.text} />
            </View>
          </Pressable>
        </View>

        <Text
          style={[
            styles.subtitle,
            {
              color: theme.muted,
            },
          ]}
        >
          Персональные рекомендации на основе ваших покупок.
        </Text>

        <HeroCard
          title="Общий анализ"
          subtitle="Полный анализ расходов, полезности покупок и привычек."
          icon="auto-awesome"
          iconColor="#007AFF"
          onPress={() => handleAction("analysis")}
        />

        <View style={styles.sectionHeader}>
          <View
            style={[
              styles.sectionLine,
              { backgroundColor: theme.primary + "20" },
            ]}
          />
          <Text
            style={[
              styles.section,
              {
                color: theme.text,
              },
            ]}
          >
            Провести анализ
          </Text>
        </View>

        <View style={styles.grid}>
          {cards.map((card) => (
            <View key={card.title} style={styles.gridItem}>
              <ActionCard
                title={card.title}
                icon={card.icon}
                color={card.color}
                onPress={() => handleAction(card.action)}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </FullModalWindow>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  subtitle: {
    fontSize: 15,
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  sectionLine: {
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  section: {
    fontSize: 20,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridItem: {
    width: "48%",
    marginBottom: 12,
  },
});
