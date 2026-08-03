import MaterialIcons from "@react-native-vector-icons/material-icons";
import { memo, useCallback, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../components/ThemeContext";
import { Receipt } from "../types";
import { fmtDate, fmtRub } from "../utils";

const RECEIPT_ROW_HEIGHT = 86;

interface Props {
  receipts: Receipt[];
  onRefresh: () => Promise<void>;
  onOpenReceiptDetail: (receipt: Receipt) => void;
  onNewReceipt: () => void;
}

interface ReceiptRowProps {
  receipt: Receipt;
  onPress: (receipt: Receipt) => void;
}

const ReceiptRow = memo(function ReceiptRow({
  receipt,
  onPress,
}: ReceiptRowProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Открыть чек ${receipt.organization}`}
      onPress={() => onPress(receipt)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: theme.primary }]} />
      <View style={styles.info}>
        <Text
          style={[styles.organization, { color: theme.text }]}
          numberOfLines={1}
        >
          {receipt.organization}
        </Text>
        <Text style={[styles.date, { color: theme.muted }]} numberOfLines={1}>
          {fmtDate(receipt.ticketDate)}
        </Text>
      </View>
      <Text style={[styles.sum, { color: theme.primary }]} numberOfLines={1}>
        {fmtRub(receipt.totalSumRub)}
      </Text>
    </Pressable>
  );
});

export function ReceiptsScreen({
  receipts,
  onRefresh,
  onOpenReceiptDetail,
  onNewReceipt,
}: Props) {
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const renderReceipt = useCallback(
    ({ item }: { item: Receipt }) => (
      <ReceiptRow receipt={item} onPress={onOpenReceiptDetail} />
    ),
    [onOpenReceiptDetail],
  );

  return (
    <FlatList
      data={receipts}
      keyExtractor={(receipt) => receipt.id}
      renderItem={renderReceipt}
      contentContainerStyle={[
        styles.list,
        receipts.length === 0 && styles.emptyList,
      ]}
      ListHeaderComponent={
        <Pressable
          accessibilityRole="button"
          onPress={onNewReceipt}
          style={({ pressed }) => [
            styles.addButton,
            {
              backgroundColor: theme.primary,
              opacity: pressed ? 0.82 : 1,
            },
          ]}
        >
          <MaterialIcons name="add" size={20} color={theme.white} />
          <Text style={[styles.addButtonText, { color: theme.white }]}>
            Добавить чек
          </Text>
        </Pressable>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <MaterialIcons name="receipt-long" size={40} color={theme.muted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Чеков пока нет
          </Text>
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            Отсканируйте чек или добавьте покупку вручную.
          </Text>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          colors={[theme.primary]}
          tintColor={theme.primary}
        />
      }
      getItemLayout={(_, index) => ({
        length: RECEIPT_ROW_HEIGHT,
        offset: RECEIPT_ROW_HEIGHT * index,
        index,
      })}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews={Platform.OS === "android"}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  emptyList: {
    flexGrow: 1,
  },
  addButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    flexDirection: "row",
    height: 76,
    marginBottom: 10,
    paddingHorizontal: 14,
  },
  accent: {
    borderRadius: 2,
    height: 30,
    marginRight: 14,
    width: 3,
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  organization: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
  },
  sum: {
    fontSize: 16,
    fontWeight: "800",
    maxWidth: "40%",
  },
  empty: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: "center",
  },
});
