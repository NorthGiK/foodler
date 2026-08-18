import MaterialIcons from "@react-native-vector-icons/material-icons";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { useMemo, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Theme } from "@/themes";
import { useTheme } from "@/components/ThemeContext";
import type { Period, Receipt, ReceiptItem } from "../types";
import { fmtRub } from "../utils";
import {
  buildCategoryExpenses,
  buildExpenseSeries,
  currentPeriodSelection,
  filterReceiptsBySelection,
  formatPeriodLabel,
  isFuturePeriod,
  shiftPeriod,
  type PeriodSelection,
} from "../stats";
import { AnimatedPressable } from "@/components/animations";

const WIDTH = Dimensions.get("screen").width;
const basket = require("../assets/ProductBasket.png") as number;

type Props = {
  receipts: Receipt[];
  joinedItems: (ReceiptItem & { ticketDate?: string })[];
};

const periods: { value: Period; label: string }[] = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
];

const categoryColors = [
  "#53764d",
  "#e25c2c",
  "#d8a33e",
  "#d5c6a9",
  "#aeb4a2",
  "#8c9b75",
];

function totalForReceipts(receipts: readonly Receipt[]): number {
  return receipts.reduce(
    (sum, receipt) => sum + Math.abs(receipt.totalSumRub),
    0,
  );
}

function PeriodTabs({
  value,
  onChange,
  theme,
}: {
  value: Period;
  onChange: (period: Period) => void;
  theme: Theme;
}) {
  return (
    <View
      style={[styles.periodTabs, { backgroundColor: theme.surfaceElevated }]}
      accessibilityRole="tablist"
    >
      {periods.map((period) => (
        <AnimatedPressable
          key={period.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === period.value }}
          onPress={() => onChange(period.value)}
          style={({ pressed }) => [
            styles.periodTab,
            {
              backgroundColor:
                value === period.value ? theme.secondary : "transparent",
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.periodTabText,
              { color: value === period.value ? theme.white : theme.muted },
            ]}
          >
            {period.label}
          </Text>
        </AnimatedPressable>
      ))}
    </View>
  );
}

function PeriodSelector({
  selection,
  onShift,
  theme,
}: {
  selection: PeriodSelection;
  onShift: (amount: number) => void;
  theme: Theme;
}) {
  const nextIsFuture = isFuturePeriod({
    period: selection.period,
    anchor: shiftPeriod(selection.anchor, selection.period, 1),
  });
  return (
    <View style={styles.periodSelector}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Предыдущий период"
        onPress={() => onShift(-1)}
        style={styles.arrowButton}
      >
        <MaterialIcons name="chevron-left" size={27} color={theme.text} />
      </Pressable>
      <Text style={[styles.periodLabel, { color: theme.secondary }]}>
        {formatPeriodLabel(selection)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Следующий период"
        disabled={nextIsFuture}
        onPress={() => onShift(1)}
        style={[styles.arrowButton, nextIsFuture && styles.disabledButton]}
      >
        <MaterialIcons name="chevron-right" size={27} color={theme.text} />
      </Pressable>
    </View>
  );
}

function EmptyStats({
  theme,
}: {
  theme: Theme;
  onUploadReceipt?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <Image
        source={basket}
        style={styles.emptyImage}
        accessibilityLabel="Корзина с продуктами"
      />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        Статистика появится здесь
      </Text>
      <Text style={[styles.emptyText, { color: theme.muted }]}>
        Загрузите первый чек — и мы создадим вашу картину расходов.
      </Text>
    </View>
  );
}

function CategoryChart({
  categories,
  total,
  theme,
}: {
  categories: ReturnType<typeof buildCategoryExpenses>;
  total: number;
  theme: Theme;
}) {
  if (categories.length === 0) {
    return (
      <Text style={[styles.noBreakdown, { color: theme.muted }]}>
        Нет данных по категориям
      </Text>
    );
  }
  const chartData = categories.map((category, index) => ({
    value: category.value,
    color: categoryColors[index % categoryColors.length],
    tooltipText: `${category.label}: ${fmtRub(category.value, false)}`,
  }));
  return (
    <View>
      <View style={styles.categoryChartRow}>
        <View style={styles.donutWrap}>
          <PieChart
            data={chartData}
            donut
            radius={92}
            innerRadius={65}
            innerCircleColor={theme.bg}
            strokeWidth={2}
            strokeColor={theme.bg}
            showTooltip
            tooltipBackgroundColor={theme.text}
            centerLabelComponent={() => (
              <View style={styles.donutCenter}>
                <Text style={[styles.donutPercent, { color: theme.text }]}>
                  {categories[0].percentage}%
                </Text>
                <Text
                  style={[styles.donutCenterLabel, { color: theme.muted }]}
                  numberOfLines={1}
                >
                  {categories[0].label}
                </Text>
              </View>
            )}
          />
        </View>
        <View style={styles.legend}>
          {categories.map((category, index) => (
            <View key={category.label} style={styles.legendRow}>
              <View
                style={[
                  styles.legendDot,
                  {
                    backgroundColor:
                      categoryColors[index % categoryColors.length],
                  },
                ]}
              />
              <View style={styles.legendCopy}>
                <Text
                  style={[styles.legendLabel, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {category.label}
                </Text>
                <Text style={[styles.legendValue, { color: theme.muted }]}>
                  {fmtRub(category.value, false)}
                </Text>
              </View>
              <Text style={[styles.legendPercent, { color: theme.text }]}>
                {category.percentage}%
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={[styles.chartFootnote, { color: theme.muted }]}>
        Всего за период: {fmtRub(total, false)}
      </Text>
    </View>
  );
}

function ExpenseChart({
  receipts,
  selection,
  theme,
}: {
  receipts: Receipt[];
  selection: PeriodSelection;
  theme: Theme;
}) {
  const points = buildExpenseSeries(receipts, selection);
  const chartWidth = Math.max(
    330,
    points.length * (selection.period === "day" ? 31 : 46),
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chartScrollContent}
    >
      <BarChart
        data={points.map((point) => ({
          value: point.value,
          label: point.label,
        }))}
        width={chartWidth}
        height={190}
        barWidth={selection.period === "day" ? 14 : 23}
        spacing={selection.period === "day" ? 17 : 23}
        initialSpacing={12}
        noOfSections={4}
        frontColor={theme.secondary}
        barBorderRadius={3}
        yAxisColor={theme.outline}
        xAxisColor={theme.outline}
        yAxisTextStyle={{ color: theme.muted, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: theme.muted, fontSize: 10 }}
        yAxisLabelWidth={42}
        formatYLabel={(value) => `${Math.round(Number(value) / 1000)}k`}
        hideRules={false}
        rulesColor={theme.border}
        rulesType="solid"
        backgroundColor="transparent"
      />
    </ScrollView>
  );
}

export function StatsScreen({ receipts, joinedItems }: Props) {
  const { theme } = useTheme();
  const [selection, setSelection] = useState<PeriodSelection>(() =>
    currentPeriodSelection("month"),
  );
  const periodReceipts = useMemo(
    () => filterReceiptsBySelection(receipts, selection),
    [receipts, selection],
  );
  const total = useMemo(
    () => totalForReceipts(periodReceipts),
    [periodReceipts],
  );
  const categories = useMemo(
    () => buildCategoryExpenses(receipts, joinedItems, selection),
    [joinedItems, receipts, selection],
  );

  const changePeriod = (nextPeriod: Period) => {
    setSelection(currentPeriodSelection(nextPeriod));
  };
  const shift = (amount: number) =>
    setSelection((current) => ({
      ...current,
      anchor: shiftPeriod(current.anchor, current.period, amount),
    }));

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: theme.text }]}>Статистика</Text>
      <PeriodSelector selection={selection} onShift={shift} theme={theme} />
      <PeriodTabs
        value={selection.period}
        onChange={changePeriod}
        theme={theme}
      />

      {periodReceipts.length === 0 ? (
        <EmptyStats theme={theme} />
      ) : (
        <>
          <Text style={[styles.total, { color: theme.text }]}>
            {fmtRub(total, false)}
          </Text>
          <Text style={[styles.totalLabel, { color: theme.text }]}>
            Всего расходов
          </Text>

          <View style={styles.categorySection}>
            <CategoryChart
              categories={categories}
              total={total}
              theme={theme}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Динамика расходов
          </Text>
          <View style={styles.chartCard}>
            <ExpenseChart
              receipts={periodReceipts}
              selection={selection}
              theme={theme}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 108, paddingHorizontal: 24, paddingTop: 27 },
  brand: { fontSize: 16, fontWeight: "700", letterSpacing: -0.4 },
  title: {
    fontFamily: "serif",
    fontSize: 42,
    fontWeight: "500",
    letterSpacing: -1.1,
    lineHeight: 58,
  },
  periodSelector: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 13,
  },
  periodLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: "500",
    textAlign: "center",
  },
  arrowButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  disabledButton: { opacity: 0.25 },
  periodTabs: {
    flex: 1,
    justifyContent: "space-evenly",
    backgroundColor: "transparent",
    borderRadius: 11,
    flexDirection: "row",
    marginTop: 19,
    padding: 4,
  },
  periodTab: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 5,
  },
  periodTabText: { fontSize: 12, fontWeight: "600" },
  total: {
    fontFamily: "serif",
    fontSize: 54,
    fontWeight: "500",
    letterSpacing: -2.5,
    lineHeight: 62,
    marginTop: 27,
  },
  totalLabel: { fontSize: 16, marginTop: 1 },
  categorySection: { marginTop: 22 },
  categoryChartRow: { alignItems: "center", flexDirection: "column" },
  donutWrap: { alignItems: "center", justifyContent: "center", width: 185 },
  donutCenter: { alignItems: "center", justifyContent: "center", width: 112 },
  donutPercent: { fontFamily: "serif", fontSize: 31, lineHeight: 35 },
  donutCenterLabel: { fontSize: 13, marginTop: 2, maxWidth: 104 },
  legend: { flex: 1, marginLeft: 11 },
  legendRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 11,
    minHeight: 30,
    minWidth: Math.round(WIDTH * 0.8),
  },
  legendDot: { borderRadius: 6, height: 12, marginRight: 8, width: 12 },
  legendCopy: { flex: 1, minWidth: 0 },
  legendLabel: { fontSize: 13, lineHeight: 17 },
  legendValue: { fontSize: 12, lineHeight: 16 },
  legendPercent: { fontSize: 13, fontWeight: "600", marginLeft: 4 },
  chartFootnote: { fontSize: 12, marginTop: 6, textAlign: "right" },
  noBreakdown: { fontSize: 15, paddingVertical: 40, textAlign: "center" },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 26 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginTop: 19 },
  chartCard: { marginLeft: -14, marginTop: 12 },
  chartScrollContent: { paddingRight: 24 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingTop: 51,
  },
  emptyImage: { height: 245, marginBottom: 7, width: 245 },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.9,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    maxWidth: 320,
    textAlign: "center",
  },
  uploadButton: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 15,
    justifyContent: "center",
    marginTop: 36,
    minHeight: 78,
    paddingHorizontal: 25,
    width: "100%",
  },
  uploadButtonText: { fontSize: 19, fontWeight: "700" },
});
