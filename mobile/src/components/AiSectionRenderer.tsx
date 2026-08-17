import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { useTheme } from "./ThemeContext";
import { AiSection } from "../ai/types";
import type { Theme } from "../themes";

interface Props {
  section: AiSection;
}

export function AiSectionRenderer({ section }: Props) {
  const { theme } = useTheme();

  switch (section.type) {
    case "text":
      return <TextSection section={section} theme={theme} />;
    case "score":
      return <ScoreSection section={section} theme={theme} />;
    case "list":
      return <ListSection section={section} theme={theme} />;
    case "products":
      return <ProductsSection section={section} theme={theme} />;
    case "chart":
      return <ChartSection section={section} theme={theme} />;
    default:
      return null;
  }
}

function TextSection({
  section,
  theme,
}: {
  section: AiSection & { type: "text" };
  theme: Theme;
}) {
  return (
    <View style={[styles.block, { borderBottomColor: theme.border }]}>
      <Text style={[styles.blockTitle, { color: theme.text }]}>
        {section.title}
      </Text>
      <Markdown
        style={{
          body: {
            color: theme.text,
            fontSize: 16,
            lineHeight: 24,
          },
          heading1: {
            color: theme.text,
            fontFamily: "Georgia",
            fontSize: 24,
            fontWeight: "400",
            marginBottom: 8,
            marginTop: 16,
          },
          heading2: {
            color: theme.text,
            fontFamily: "Georgia",
            fontSize: 20,
            fontWeight: "400",
            marginBottom: 6,
            marginTop: 12,
          },
          heading3: {
            color: theme.text,
            fontSize: 17,
            fontWeight: "600",
            marginBottom: 4,
            marginTop: 8,
          },
          strong: {
            color: theme.text,
            fontWeight: "700",
          },
          bullet_list: {
            marginBottom: 8,
          },
          list_item: {
            marginBottom: 4,
          },
          bullet: {
            color: theme.primary,
            fontSize: 18,
          },
          paragraph: {
            marginBottom: 8,
          },
          hr: {
            backgroundColor: theme.border,
            height: 1,
            marginVertical: 12,
          },
        }}
      >
        {section.text}
      </Markdown>
    </View>
  );
}

function ScoreSection({
  section,
  theme,
}: {
  section: AiSection & { type: "score" };
  theme: Theme;
}) {
  const max = section.max ?? 100;
  const pct =
    max > 0 ? Math.min(100, Math.max(0, (section.value / max) * 100)) : 0;
  const barColor =
    pct >= 80
      ? (theme.accent ?? theme.secondary)
      : pct >= 50
        ? (theme.accent2 ?? theme.primary)
        : theme.primary;

  return (
    <View style={[styles.block, { borderBottomColor: theme.border }]}>
      <Text style={[styles.blockTitle, { color: theme.text }]}>
        {section.title}
      </Text>
      <View style={styles.scoreRow}>
        <Text style={[styles.scoreValue, { color: barColor }]}>
          {section.value}
          {max ? (
            <Text style={[styles.scoreMax, { color: theme.muted }]}>
              /{max}
            </Text>
          ) : null}
        </Text>
      </View>
      <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${pct}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

function ListSection({
  section,
  theme,
}: {
  section: AiSection & { type: "list" };
  theme: Theme;
}) {
  return (
    <View style={[styles.block, { borderBottomColor: theme.border }]}>
      <Text style={[styles.blockTitle, { color: theme.text }]}>
        {section.title}
      </Text>
      {section.items.map((item, i) => (
        <View
          key={i}
          style={[
            styles.listItem,
            i > 0 && {
              borderTopColor: theme.border,
              borderTopWidth: 1,
            },
          ]}
        >
          <Text style={[styles.bullet, { color: theme.primary }]}>•</Text>
          <Text style={[styles.listText, { color: theme.muted }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function ProductsSection({
  section,
  theme,
}: {
  section: AiSection & { type: "products" };
  theme: Theme;
}) {
  return (
    <View style={[styles.block, { borderBottomColor: theme.border }]}>
      <Text style={[styles.blockTitle, { color: theme.text }]}>
        {section.title}
      </Text>
      {section.products.map((product, i) => (
        <View
          key={i}
          style={[
            styles.productRow,
            i > 0 && {
              borderTopColor: theme.border,
              borderTopWidth: 1,
            },
          ]}
        >
          <View style={styles.productInfo}>
            <Text style={[styles.productName, { color: theme.text }]}>
              {product.name}
            </Text>
            <Text style={[styles.productReason, { color: theme.muted }]}>
              {product.reason}
            </Text>
          </View>
          {product.price != null && (
            <Text style={[styles.productPrice, { color: theme.primary }]}>
              {product.price} ₽
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function ChartSection({
  section,
  theme,
}: {
  section: AiSection & { type: "chart" };
  theme: Theme;
}) {
  const maxVal = Math.max(...section.values, 1);
  const chartColors = [
    theme.primary,
    theme.accent2 ?? theme.primary,
    theme.secondary,
  ];

  return (
    <View style={[styles.block, { borderBottomColor: theme.border }]}>
      <Text style={[styles.blockTitle, { color: theme.text }]}>
        {section.title}
      </Text>
      <View style={styles.chartContainer}>
        {section.values.map((val, i) => {
          const safeValue = Math.max(0, val);
          const heightPct = (safeValue / maxVal) * 100;
          return (
            <View key={i} style={styles.chartColumn}>
              <Text style={[styles.chartValue, { color: theme.muted }]}>
                {val}
              </Text>
              <View
                style={[
                  styles.chartBar,
                  {
                    height: `${Math.max(4, heightPct)}%`,
                    backgroundColor: chartColors[i % chartColors.length],
                    opacity: 0.65 + 0.35 * (safeValue / maxVal),
                  },
                ]}
              />
              <Text style={[styles.chartLabel, { color: theme.muted }]}>
                {section.labels[i]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingVertical: 18,
    marginBottom: 14,
    borderBottomWidth: 1,
  },
  blockTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 10,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: "700",
  },
  scoreMax: {
    fontSize: 18,
    fontWeight: "400",
  },
  progressBar: {
    height: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  listItem: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingRight: 4,
  },
  bullet: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 2,
  },
  listText: {
    fontSize: 16,
    lineHeight: 23,
    flex: 1,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 21,
  },
  productReason: {
    fontSize: 14,
    lineHeight: 20,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 12,
  },
  chartContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 160,
    paddingTop: 20,
  },
  chartColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  chartValue: {
    fontSize: 10,
    marginBottom: 4,
  },
  chartBar: {
    width: "54%",
    minHeight: 4,
  },
  chartLabel: {
    fontSize: 10,
    marginTop: 6,
  },
});
