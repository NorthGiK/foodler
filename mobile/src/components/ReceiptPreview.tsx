import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ReceiptItem } from "../types";
import { fmtRub } from "../utils";

export const ReceiptPreview = memo(function ReceiptPreview({
  items,
  storeName,
  totalRub,
}: {
  items: ReceiptItem[];
  storeName: string;
  totalRub: number;
}) {
  const previewItems = items.slice(0, 3);

  return (
    <View accessibilityElementsHidden style={styles.preview}>
      <Text numberOfLines={1} style={styles.previewStore}>
        {storeName}
      </Text>
      <View style={styles.previewRule} />
      {previewItems.map((item, index) => (
        <View
          key={`${item.id ?? item.name}-${index}`}
          style={styles.previewLine}
        >
          <Text numberOfLines={1} style={styles.previewText}>
            {item.name}
          </Text>
          <Text style={styles.previewSum}>{fmtRub(item.sumRub)}</Text>
        </View>
      ))}
      {previewItems.length === 0 && <View style={styles.previewPlaceholder} />}
      <View style={styles.previewRule} />
      <View style={styles.previewLine}>
        <Text style={styles.previewTotal}>ИТОГ</Text>
        <Text style={styles.previewTotal}>{fmtRub(totalRub)}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  preview: {
    backgroundColor: "#FFFDF8",
    elevation: 2,
    marginRight: 17,
    padding: 7,
    shadowColor: "#473D31",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 3,
    width: 85,
  },
  previewStore: {
    color: "#433F39",
    fontSize: 7,
    fontWeight: "700",
    textAlign: "center",
  },
  previewRule: {
    backgroundColor: "#B6ADA1",
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  previewLine: {
    flexDirection: "row",
    gap: 3,
    justifyContent: "space-between",
    marginBottom: 2,
  },
  previewText: { color: "#645D54", flex: 1, fontSize: 5.5 },
  previewSum: { color: "#645D54", fontSize: 5.5 },
  previewTotal: { color: "#433F39", fontSize: 6, fontWeight: "700" },
  previewPlaceholder: { height: 26 },
});
