import React, { Fragment } from "react";
import {
  Svg,
  Path,
  Rect,
  Text as SvgText,
  Line,
  Circle,
} from "react-native-svg";
import { useTheme } from "@/components/ThemeContext";
import { ChartKind } from "@/types";

interface LineBarChartProps {
  points: { label: string; value: number }[];
  kind: ChartKind;
}

export function LineBarChart({ points, kind }: LineBarChartProps) {
  const width = 340;
  const height = 220;
  const padding = 26;
  const max = Math.max(1, ...points.map((p) => p.value));
  const min = 0;
  const xStep =
    points.length > 1 ? (width - padding * 2) / (points.length - 1) : 1;
  const yScale = (v: number) =>
    height - padding - ((v - min) / (max - min || 1)) * (height - padding * 2);

  const { theme } = useTheme();

  const linePath = points
    .map((point, index) => {
      const x = padding + index * xStep;
      const y = yScale(point.value);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        stroke={theme.outline}
        strokeWidth="1"
      />
      <Line
        x1={padding}
        y1={padding}
        x2={padding}
        y2={height - padding}
        stroke={theme.outline}
        strokeWidth="1"
      />

      {[0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = padding + (height - padding * 2) * ratio;
        const label = (max * (1 - ratio)).toFixed(0);
        return (
          <Fragment key={ratio}>
            <Line
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke={theme.outline}
              strokeOpacity={0.35}
              strokeWidth="1"
            />
            <SvgText x={4} y={y + 4} fill={theme.muted} fontSize="10">
              {label}
            </SvgText>
          </Fragment>
        );
      })}

      {kind === "line" ? (
        <>
          <Path
            d={linePath}
            fill="none"
            stroke={theme.surface}
            strokeWidth="3"
          />
          {points.map((point, index) => {
            const x = padding + index * xStep;
            const y = yScale(point.value);
            return (
              <Circle
                key={point.label + index}
                cx={x}
                cy={y}
                r={3.5}
                fill={theme.secondary}
              />
            );
          })}
        </>
      ) : null}

      {kind === "bar"
        ? points.map((point, index) => {
            const barWidth = Math.max(
              8,
              (width - padding * 2) / points.length - 6,
            );
            const x =
              padding + index * ((width - padding * 2) / points.length) + 3;
            const barHeight =
              ((point.value - min) / (max - min || 1)) * (height - padding * 2);
            const y = height - padding - barHeight;
            return (
              <Rect
                key={point.label + index}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="4"
                fill={theme.primaryContainer}
              />
            );
          })
        : null}

      {points.map((point, index) => {
        const x =
          kind === "line"
            ? padding + index * xStep
            : padding + index * ((width - padding * 2) / points.length) + 1;
        return (
          <SvgText
            key={point.label + "label"}
            x={x}
            y={height - 8}
            fill={theme.muted}
            fontSize="9"
            textAnchor="middle"
          >
            {point.label}
          </SvgText>
        );
      })}
    </Svg>
  );
}
