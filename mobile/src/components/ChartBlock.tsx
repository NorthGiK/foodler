import React from "react";
import { Dimensions, ScrollView } from "react-native";
import { BarChart, LineChart } from "react-native-gifted-charts";
import { ChartKind } from "@/types";
import { useTheme } from "@/components/ThemeContext";

const screenWidth = Dimensions.get("window").width - 140;

interface Props {
  points: { label: string; value: number }[];
  kind: ChartKind;
}

export function ChartBlock({ points, kind }: Props) {
  const { theme } = useTheme();
  if (points.length === 0) return null;
  const chartData = points.map((p) => ({ value: p.value, label: p.label }));

  const commonProps = {
    width: Math.max(screenWidth, points.length * 50),
    height: 200,
    noOfSections: 4,
    yAxisColor: theme.outline,
    xAxisColor: theme.outline,
    xAxisLabelTextStyle: { color: theme.muted, fontSize: 10 },
    yAxisTextStyle: { color: theme.muted, fontSize: 10 },
    initialSpacing: 10,
    spacing: 40,
    backgroundColor: "transparent",
  };

  if (kind === "line") {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <LineChart
          {...commonProps}
          data={chartData}
          color={theme.primary}
          thickness={2}
          startFillColor={theme.primary}
          endFillColor={theme.primary}
          startOpacity={0.1}
          endOpacity={0.01}
          dataPointsColor={theme.primary}
          dataPointsRadius={4}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <BarChart
        {...commonProps}
        data={chartData}
        barWidth={22}
        barBorderRadius={4}
        frontColor={theme.primary}
        gradientColor={theme.primaryContainer}
        yAxisExtraHeight={20}
      />
    </ScrollView>
  );
}
