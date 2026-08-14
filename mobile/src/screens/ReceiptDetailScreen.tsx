import MaterialIcons from "@react-native-vector-icons/material-icons";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { queueReceiptDeletion, syncPendingReceiptDeletions } from "../api/sync";
import { analyticsEvents } from "../analytics/facade";
import { useTheme } from "../components/ThemeContext";
import { deleteReceipt, loadReceiptItems, openDb } from "../storage";
import type { ReceiptItem } from "../types";
import { fmtDate, fmtRub, groupReceiptItems } from "../utils";
import { getStoreDisplayName } from "../storeAliases";

type LoadState = "loading" | "success" | "error";

export function ReceiptDetailScreen() {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "ReceiptDetail">>();
  const receipt = route.params.receipt;
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const groupedItems = useMemo(() => groupReceiptItems(items), [items]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [deleting, setDeleting] = useState(false);

  const loadItems = useCallback(async () => {
    setLoadState("loading");
    try {
      const db = await openDb();
      setItems(await loadReceiptItems(db, receipt.id));
      setLoadState("success");
    } catch {
      setLoadState("error");
    }
  }, [receipt.id]);

  useFocusEffect(
    useCallback(() => {
      void analyticsEvents.receiptDetailViewed();
      void loadItems();
    }, [loadItems]),
  );

  const deleteLocallyAndRemotely = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const db = await openDb();
      await deleteReceipt(db, receipt.id);
      await queueReceiptDeletion(receipt.id);
      void analyticsEvents.receiptDeleted();
      try {
        navigation.goBack();
      } catch {}
      void syncPendingReceiptDeletions();
    } catch {
      Alert.alert("Ошибка", "Не удалось удалить локальный чек.");
      setDeleting(false);
    }
  }, [deleting, navigation, receipt.id]);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      "Удалить чек?",
      "Чек и его товары будут удалены с этого устройства.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => void deleteLocallyAndRemotely(),
        },
      ],
    );
  }, [deleteLocallyAndRemotely]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.headerButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: theme.text }]}
          numberOfLines={2}
        >
          {getStoreDisplayName(receipt.organization, route.params.storeAliases)}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <FlatList
        data={groupedItems}
        keyExtractor={(item, index) =>
          String(item.id ?? `${item.name}-${index}`)
        }
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <View style={[styles.item, { borderColor: theme.border }]}>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, { color: theme.text }]}>
                {item.name}
              </Text>
              <Text style={[styles.itemMeta, { color: theme.muted }]}>
                {item.category} · {item.quantity} × {fmtRub(item.priceRub)}
              </Text>
            </View>
            <Text style={[styles.itemSum, { color: theme.primary }]}>
              {fmtRub(item.sumRub)}
            </Text>
          </View>
        )}
        ListHeaderComponent={
          <View
            style={[
              styles.summary,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.total, { color: theme.primary }]}>
              {fmtRub(receipt.totalSumRub)}
            </Text>
            <Text style={[styles.date, { color: theme.muted }]}>
              {fmtDate(receipt.ticketDate)}
            </Text>
          </View>
        }
        ListEmptyComponent={
          loadState === "loading" ? (
            <ActivityIndicator
              style={styles.state}
              size="large"
              color={theme.primary}
            />
          ) : loadState === "error" ? (
            <View style={styles.state}>
              <Text style={[styles.stateTitle, { color: theme.text }]}>
                Не удалось загрузить товары
              </Text>
              <Pressable
                onPress={() => void loadItems()}
                style={[styles.retry, { backgroundColor: theme.primary }]}
              >
                <Text style={[styles.retryText, { color: theme.white }]}>
                  Повторить
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.empty, { color: theme.muted }]}>
              В этом чеке нет товарных позиций.
            </Text>
          )
        }
        ListFooterComponent={
          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={confirmDelete}
            style={({ pressed }) => [
              styles.deleteButton,
              {
                backgroundColor: `${theme.error}15`,
                opacity: deleting || pressed ? 0.65 : 1,
              },
            ]}
          >
            <MaterialIcons
              name="delete-outline"
              size={18}
              color={theme.error}
            />
            <Text style={[styles.deleteText, { color: theme.error }]}>
              {deleting ? "Удаление…" : "Удалить чек"}
            </Text>
          </Pressable>
        }
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  headerButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    marginHorizontal: 8,
    textAlign: "center",
  },
  content: {
    flexGrow: 1,
    paddingBottom: 80,
    paddingHorizontal: 20,
  },
  summary: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
  },
  total: {
    fontSize: 32,
    fontWeight: "900",
  },
  date: {
    fontSize: 13,
    marginTop: 4,
  },
  item: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 64,
    paddingVertical: 10,
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
  },
  itemMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  itemSum: {
    fontSize: 14,
    fontWeight: "700",
  },
  state: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 180,
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  retry: {
    borderRadius: 12,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "700",
  },
  empty: {
    fontSize: 14,
    paddingVertical: 48,
    textAlign: "center",
  },
  deleteButton: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 20,
    paddingVertical: 13,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
