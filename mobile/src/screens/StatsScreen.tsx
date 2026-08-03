import React, { useMemo, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { Theme } from "@/themes";
import { useTheme } from "@/components/ThemeContext";
import { Segmented } from "../components/Segmented";
import { ChartBlock } from "../components/ChartBlock";
import { MiniCard } from "../components/MiniCard";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { Period, ChartKind, Receipt, ReceiptItem } from "../types";
import {
  filterReceiptsByPeriod,
  buildAllTimeSeries,
  fmtRub,
  sumBy,
} from "../utils";
import { useStaggeredFadeIn } from "../components/animations";

interface Props {
  receipts: Receipt[];
  joinedItems: (ReceiptItem & { ticketDate?: string })[];
  onRefresh?: () => void;
}

const periodItems: { value: Period; label: string }[] = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
];

const chartKindItems: { value: ChartKind; label: string }[] = [
  { value: "bar", label: "Столбцы" },
  { value: "line", label: "Линия" },
];

const categoryColors = ["#007AFF", "#34C759", "#FF9500", "#FF3B30", "#AF52DE"];

export function StatsScreen({ receipts, joinedItems }: Props) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [period, setPeriod] = useState<Period>("month");
  const [chartKind, setChartKind] = useState<ChartKind>("bar");

  const filtered = useMemo(
    () => filterReceiptsByPeriod(receipts, period),
    [receipts, period],
  );
  const total = useMemo(
    () => filtered.reduce((sum, r) => sum + r.totalSumRub, 0),
    [filtered],
  );
  const avg = filtered.length ? total / filtered.length : 0;

  const categoryStats = useMemo(() => {
    const ids = new Set(filtered.map((r) => r.id));
    const items = joinedItems.filter((it) => ids.has(it.receiptId));
    return sumBy(
      items,
      (it) => it.category,
      (it) => Math.abs(it.sumRub),
    ).slice(0, 5);
  }, [joinedItems, filtered]);

  const chartPoints = useMemo(
    () => buildAllTimeSeries(receipts, period),
    [receipts, period],
  );
  const cardStyles = useStaggeredFadeIn(5, 80);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={cardStyles[0]}>
        <Text style={[styles.title, { color: theme.text }]}>
          Статистика расходов
        </Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Анализ ваших трат за выбранный период
        </Text>
      </Animated.View>

      <Animated.View style={cardStyles[1]}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.cardLabel, { color: theme.text }]}>Период</Text>
          <Segmented value={period} items={periodItems} onChange={setPeriod} />
        </View>
      </Animated.View>

      <Animated.View style={cardStyles[2]}>
        <View style={styles.statsRow}>
          <MiniCard
            title="Потрачено"
            value={fmtRub(total)}
            hint={`${filtered.length} чеков`}
            icon="account-balance-wallet"
            color="#007AFF"
          />
          <MiniCard
            title="Средний чек"
            value={fmtRub(avg)}
            icon="trending-up"
            color="#34C759"
          />
        </View>
      </Animated.View>

      <Animated.View style={cardStyles[3]}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <ChartBlock points={chartPoints} kind={chartKind} />
          <View style={styles.chartToggle}>
            <Text style={[styles.cardLabel, { color: theme.text }]}>
              Тип графика
            </Text>
            <Segmented
              value={chartKind}
              items={chartKindItems}
              onChange={setChartKind}
            />
          </View>
        </View>
      </Animated.View>

      <Animated.View style={cardStyles[4]}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View
              style={[
                styles.sectionIcon,
                { backgroundColor: theme.primary + "15" },
              ]}
            >
              <MaterialIcons
                name="emoji-events"
                size={18}
                color={theme.primary}
              />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Топ категорий
            </Text>
          </View>
          {categoryStats.map((item, idx) => (
            <View key={item.label} style={styles.categoryRow}>
              <View
                style={[
                  styles.categoryIndicator,
                  {
                    backgroundColor:
                      categoryColors[idx % categoryColors.length],
                  },
                ]}
              />
              <Text style={[styles.categoryLabel, { color: theme.text }]}>
                {idx + 1}. {item.label}
              </Text>
              <Text style={[styles.categoryValue, { color: theme.primary }]}>
                {fmtRub(item.value)}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const getStyles = (theme: Theme) => {
  function shadow(e: number) {
    return {
      elevation: e,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: e / 2 },
      shadowOpacity: 0.12,
      shadowRadius: e,
    };
  }

  return StyleSheet.create({
    container: { flex: 1 },
    content: {
      padding: 20,
      paddingBottom: 100,
    },
    title: {
      fontSize: 32,
      fontWeight: "800",
      marginTop: 12,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 15,
      marginTop: 6,
      marginBottom: 28,
      lineHeight: 22,
    },
    card: {
      borderRadius: 20,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      ...shadow(2),
    },
    cardLabel: {
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 12,
    },
    statsRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 16,
    },
    chartToggle: {
      marginTop: 16,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
    },
    sectionIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: "center",
      alignItems: "center",
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
    },
    categoryRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 12,
    },
    categoryIndicator: {
      width: 4,
      height: 24,
      borderRadius: 2,
    },
    categoryLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: "500",
    },
    categoryValue: {
      fontSize: 15,
      fontWeight: "700",
    },
  });
};
