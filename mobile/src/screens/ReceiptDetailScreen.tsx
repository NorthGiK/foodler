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
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { queueReceiptDeletion, syncPendingReceiptDeletions } from "../api/sync";
import { analyticsEvents } from "../analytics/facade";
import { BUILT_IN_CATEGORIES, FALLBACK_CATEGORY } from "../category";
import { ReceiptPreview } from "../components/ReceiptPreview";
import { useTheme } from "../components/ThemeContext";
import {
  deleteReceipt,
  hasLocalCategoryOverride,
  loadReceiptItems,
  openDb,
  removeLocalCategoryOverride,
  saveLocalCategoryOverride,
} from "../storage";
import type { ReceiptItem } from "../types";
import {
  buildReceiptCategoryTotals,
  fmtDate,
  fmtRub,
  groupReceiptItems,
} from "../utils";
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
  const categoryTotals = useMemo(
    () => buildReceiptCategoryTotals(groupedItems),
    [groupedItems],
  );
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [deleting, setDeleting] = useState(false);
  const [editingItem, setEditingItem] = useState<ReceiptItem | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

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

  const openCategoryEditor = useCallback(async (item: ReceiptItem) => {
    setEditingItem(item);
    setCustomCategory("");
    try {
      const db = await openDb();
      setHasOverride(await hasLocalCategoryOverride(db, item.name));
    } catch {
      setHasOverride(false);
    }
  }, []);

  const closeCategoryEditor = useCallback(() => {
    if (!savingCategory) setEditingItem(null);
  }, [savingCategory]);

  const saveCategory = useCallback(
    async (category: string) => {
      if (!editingItem || savingCategory || !category.trim()) return;
      setSavingCategory(true);
      try {
        const db = await openDb();
        await saveLocalCategoryOverride(db, editingItem.name, category);
        await loadItems();
        setEditingItem(null);
      } catch {
        Alert.alert("Ошибка", "Не удалось сохранить категорию.");
      } finally {
        setSavingCategory(false);
      }
    },
    [editingItem, loadItems, savingCategory],
  );

  const resetCategory = useCallback(async () => {
    if (!editingItem || savingCategory) return;
    setSavingCategory(true);
    try {
      const db = await openDb();
      await removeLocalCategoryOverride(db, editingItem.name);
      await loadItems();
      setEditingItem(null);
    } catch {
      Alert.alert("Ошибка", "Не удалось вернуть определённую категорию.");
    } finally {
      setSavingCategory(false);
    }
  }, [editingItem, loadItems, savingCategory]);

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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Изменить категорию товара ${item.name}`}
                onPress={() => void openCategoryEditor(item)}
                hitSlop={6}
              >
                <Text style={[styles.itemMeta, { color: theme.muted }]}>
                  {item.category} · {item.quantity} × {fmtRub(item.priceRub)}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.itemSum, { color: theme.primary }]}>
              {fmtRub(item.sumRub)}
            </Text>
          </View>
        )}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <View style={styles.heroCopy}>
                <Text style={[styles.total, { color: theme.primary }]}>
                  {fmtRub(receipt.totalSumRub, false)}
                </Text>
                <Text style={[styles.date, { color: theme.muted }]}>
                  {fmtDate(receipt.ticketDate)}
                </Text>
              </View>
              <ReceiptPreview
                items={groupedItems}
                storeName={getStoreDisplayName(
                  receipt.organization,
                  route.params.storeAliases,
                )}
                totalRub={receipt.totalSumRub}
                itemsCount={Math.min(items.length, 13)}
              />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Состав покупки
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
          <View>
            {loadState === "success" && categoryTotals.length > 0 ? (
              <View style={styles.categoryTotals}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Итоги по категориям
                </Text>
                {categoryTotals.map((category) => (
                  <View key={category.label} style={styles.categoryTotalRow}>
                    <Text
                      style={[styles.categoryTotalLabel, { color: theme.text }]}
                    >
                      {category.label}
                    </Text>
                    <Text
                      style={[styles.categoryTotalValue, { color: theme.text }]}
                    >
                      {fmtRub(category.sumRub)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={[styles.receiptTotal, { borderColor: theme.border }]}>
              <Text style={[styles.receiptTotalLabel, { color: theme.muted }]}>
                Итого по чеку
              </Text>
              <Text
                style={[styles.receiptTotalValue, { color: theme.primary }]}
              >
                {fmtRub(receipt.totalSumRub)}
              </Text>
            </View>
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
          </View>
        }
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        showsVerticalScrollIndicator={false}
      />
      <Modal
        animationType="slide"
        transparent
        visible={editingItem !== null}
        onRequestClose={closeCategoryEditor}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modal,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Категория товара
            </Text>
            <Text style={[styles.modalProduct, { color: theme.muted }]}>
              {editingItem?.name}
            </Text>
            <ScrollView
              contentContainerStyle={styles.categoryList}
              showsVerticalScrollIndicator={false}
            >
              {[...BUILT_IN_CATEGORIES, FALLBACK_CATEGORY].map((category) => (
                <Pressable
                  key={category}
                  accessibilityRole="button"
                  disabled={savingCategory}
                  onPress={() => void saveCategory(category)}
                  style={({ pressed }) => [
                    styles.categoryOption,
                    {
                      borderColor: theme.border,
                      opacity: savingCategory || pressed ? 0.65 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[styles.categoryOptionText, { color: theme.text }]}
                  >
                    {category === FALLBACK_CATEGORY ? "Прочее" : category}
                  </Text>
                </Pressable>
              ))}
              <Text style={[styles.customLabel, { color: theme.text }]}>
                Своя категория
              </Text>
              <TextInput
                accessibilityLabel="Своя категория"
                editable={!savingCategory}
                maxLength={80}
                onChangeText={setCustomCategory}
                onSubmitEditing={() => void saveCategory(customCategory)}
                placeholder="Например, Детское питание"
                placeholderTextColor={theme.muted}
                style={[
                  styles.categoryInput,
                  {
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                value={customCategory}
              />
              <Pressable
                accessibilityRole="button"
                disabled={savingCategory || !customCategory.trim()}
                onPress={() => void saveCategory(customCategory)}
                style={({ pressed }) => [
                  styles.customSaveButton,
                  {
                    backgroundColor: theme.primary,
                    opacity:
                      savingCategory || !customCategory.trim() || pressed
                        ? 0.65
                        : 1,
                  },
                ]}
              >
                <Text style={[styles.customSaveText, { color: theme.white }]}>
                  Сохранить свою категорию
                </Text>
              </Pressable>
              {hasOverride ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={savingCategory}
                  onPress={() => void resetCategory()}
                  style={({ pressed }) => [
                    styles.resetButton,
                    { opacity: savingCategory || pressed ? 0.65 : 1 },
                  ]}
                >
                  <Text style={[styles.resetText, { color: theme.primary }]}>
                    Вернуть определённую категорию
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={savingCategory}
                onPress={closeCategoryEditor}
                style={styles.cancelButton}
              >
                <Text style={[styles.cancelText, { color: theme.muted }]}>
                  Отмена
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    textAlign: "left",
  },
  content: {
    flexGrow: 1,
    paddingBottom: 80,
    paddingHorizontal: 20,
  },
  hero: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 27,
    paddingTop: 12,
  },
  heroCopy: {
    flex: 1,
    marginRight: 18,
  },
  total: {
    fontFamily: "serif",
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -1.5,
  },
  date: {
    fontSize: 14,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
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
    fontFamily: "serif",
    fontSize: 14,
    fontWeight: "700",
  },
  categoryTotals: {
    marginTop: 31,
  },
  categoryTotalRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
  },
  categoryTotalLabel: { fontSize: 15 },
  categoryTotalValue: { fontFamily: "serif", fontSize: 15, fontWeight: "700" },
  receiptTotal: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    paddingTop: 17,
  },
  receiptTotalLabel: { fontSize: 15, fontWeight: "600" },
  receiptTotalValue: { fontFamily: "serif", fontSize: 22, fontWeight: "800" },
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
    marginTop: 50,
    paddingVertical: 13,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: "700",
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: "85%",
    padding: 20,
    width: "100%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  modalProduct: {
    fontSize: 13,
    marginTop: 4,
  },
  categoryList: {
    paddingTop: 16,
  },
  categoryOption: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  categoryOptionText: {
    fontSize: 15,
    fontWeight: "600",
  },
  customLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 20,
  },
  categoryInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  customSaveButton: {
    alignItems: "center",
    borderRadius: 12,
    marginTop: 10,
    paddingVertical: 12,
  },
  customSaveText: {
    fontSize: 14,
    fontWeight: "700",
  },
  resetButton: {
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 10,
  },
  resetText: {
    fontSize: 14,
    fontWeight: "700",
  },
  cancelButton: {
    alignItems: "center",
    marginTop: 6,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
