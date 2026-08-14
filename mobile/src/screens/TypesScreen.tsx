import React, { useMemo, useState } from "react";
import { Animated, ScrollView, StyleSheet, View } from "react-native";
import { Theme } from "@/themes";
import { useTheme } from "@/components/ThemeContext";
import Dropdown from "../components/Dropdown";
import { StatList } from "../components/StatList";
import type { Period, CategoryMode, Receipt, ReceiptItem } from "../types";
import { filterReceiptsByPeriod, sumBy } from "../utils";
import { useStaggeredFadeIn } from "../components/animations";

interface TypesScreenProps {
  receipts: Receipt[];
  joinedItems: (ReceiptItem & { ticketDate?: string })[];
  onRefresh?: () => void;
}

const periodItems: { label: string; value: string }[] = [
  { label: "День", value: "day" },
  { label: "Неделя", value: "week" },
  { label: "Месяц", value: "month" },
  { label: "Год", value: "year" },
];

const modeItems: { label: string; value: string }[] = [
  { label: "Частота", value: "count" },
  { label: "Сумма", value: "spend" },
];

export function TypesScreen({ receipts, joinedItems }: TypesScreenProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  // Show receipts with their actual purchase dates on first open.
  const [period, setPeriod] = useState<Period>("year");
  const [mode, setMode] = useState<CategoryMode>("count");

  const filteredReceipts = useMemo(
    () => filterReceiptsByPeriod(receipts, period),
    [receipts, period],
  );
  const filteredItems = useMemo(() => {
    const ids = new Set(filteredReceipts.map((r) => r.id));
    return joinedItems.filter((item) => ids.has(item.receiptId));
  }, [joinedItems, filteredReceipts]);

  const stats = useMemo(() => {
    if (mode === "count") {
      return sumBy(
        filteredItems,
        (item) => item.category,
        () => 1,
      );
    }
    return sumBy(
      filteredItems,
      (item) => item.category,
      (item) => Math.abs(item.sumRub),
    );
  }, [filteredItems, mode]);

  const cardStyles = useStaggeredFadeIn(3, 80);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={cardStyles[0]}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Dropdown
            label="Период"
            value={period}
            items={periodItems}
            onChange={(v) => setPeriod(v as Period)}
          />
          <Dropdown
            label="Режим"
            value={mode}
            items={modeItems}
            onChange={(v) => setMode(v as CategoryMode)}
          />
        </View>
      </Animated.View>

      <Animated.View style={cardStyles[1]}>
        <StatList
          title={mode === "count" ? "Самые частые категории" : "Самые дорогие категории"}
          data={stats.slice(0, 10)}
        />
      </Animated.View>

    </ScrollView>
  );
}

const getStyles = (_theme: Theme) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingBottom: 100,
      gap: 14,
      paddingTop: 20,
    },
    card: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 16,
      gap: 16,
      marginBottom: 0,
    },
    title: { fontSize: 18, fontWeight: "700" },
    body: { lineHeight: 22, fontSize: 14 },
  });
