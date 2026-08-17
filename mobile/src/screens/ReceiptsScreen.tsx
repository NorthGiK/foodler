import React from "react";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from "expo-image-picker";
import { analyticsEvents, AnalyticsCancelledError } from "../analytics/facade";
import { getReceiptByRawQR } from "../api/client";
import { normalizeReceiptResponse, saveReceipt } from "../storage";
import { getStoreDisplayName, type StoreAliases } from "../storeAliases";
import type { Receipt, ReceiptItem } from "../types";
import { fmtRub } from "../utils";
import { useTheme } from "../components/ThemeContext";
import TomatoIcon from "../assets/TomatoOutline.svg";
import FullModalWindow from "@/components/FullModalWindow";

const basket = require("../assets/ProductBasket.png") as number;
const tomato = require("../assets/TomatoOutline.svg") as number;
const EMPTY_ITEMS: ReceiptItem[] = [];

type JoinedItem = ReceiptItem & { ticketDate?: string };
type ReceiptListItem =
  | { key: string; kind: "day"; title: string }
  | { key: string; kind: "receipt"; receipt: Receipt };

interface Props {
  db: SQLiteDatabase | null;
  receipts: Receipt[];
  joinedItems: JoinedItem[];
  onRefresh: () => Promise<void>;
  onOpenReceiptDetail: (receipt: Receipt) => void;
  storeAliases: StoreAliases;
}

interface ReceiptRowProps {
  receipt: Receipt;
  items: ReceiptItem[];
  onPress: (receipt: Receipt) => void;
  storeAliases: StoreAliases;
}

function dayTitle(ticketDate: string): string {
  const date = new Date(ticketDate);
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
    return "Сегодня";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(date);
}

function buildListItems(receipts: readonly Receipt[]): ReceiptListItem[] {
  const list: ReceiptListItem[] = [];
  let previousDay = "";
  for (const receipt of receipts) {
    const title = dayTitle(receipt.ticketDate);
    if (title !== previousDay) {
      list.push({ key: `day-${receipt.id}`, kind: "day", title });
      previousDay = title;
    }
    list.push({ key: receipt.id, kind: "receipt", receipt });
  }
  return list;
}

const ReceiptPreview = memo(function ReceiptPreview({
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

const ReceiptRow = memo(function ReceiptRow({
  receipt,
  items,
  onPress,
  storeAliases,
}: ReceiptRowProps) {
  const { theme } = useTheme();
  const storeName = getStoreDisplayName(receipt.organization, storeAliases);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Открыть чек ${storeName}`}
      onPress={() => onPress(receipt)}
      style={({ pressed }) => [
        styles.receiptRow,
        { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <ReceiptPreview
        items={items}
        storeName={storeName}
        totalRub={receipt.totalSumRub}
      />
      <View style={styles.receiptContent}>
        <Text
          numberOfLines={1}
          style={[styles.storeName, { color: theme.text }]}
        >
          {storeName}
        </Text>
        <Text style={[styles.receiptSum, { color: theme.text }]}>
          {fmtRub(receipt.totalSumRub)}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={25} color={theme.muted} />
    </Pressable>
  );
});

export function ReceiptsScreen({
  db,
  receipts,
  joinedItems,
  onRefresh,
  onOpenReceiptDetail,
  storeAliases,
}: Props) {
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const receiptItemsById = useMemo(() => {
    const result = new Map<string, ReceiptItem[]>();
    for (const item of joinedItems) {
      const receiptItems = result.get(item.receiptId) ?? [];
      receiptItems.push(item);
      result.set(item.receiptId, receiptItems);
    }
    return result;
  }, [joinedItems]);
  const listItems = useMemo(() => buildListItems(receipts), [receipts]);

  const closeScanningQr = () => !capturing && setSheetVisible(false)

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const pickImage = useCallback(
    async (source: "camera" | "image") => {
      if (capturing || !db) return;
      setCapturing(true);
      const startedAt = Date.now();
      void analyticsEvents.receiptCapture(
        "receipt_capture_started",
        "image",
        startedAt,
      );
      try {
        const permission =
          source === "camera"
            ? await requestCameraPermissionsAsync()
            : await requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Нет доступа",
            source === "camera"
              ? "Разрешите доступ к камере, чтобы сфотографировать чек."
              : "Разрешите доступ к фотографиям, чтобы выбрать изображение чека.",
          );
          void analyticsEvents.receiptCapture(
            "receipt_capture_failed",
            "image",
            startedAt,
            new AnalyticsCancelledError(),
          );
          return;
        }
        const result = await (
          source === "camera" ? launchCameraAsync : launchImageLibraryAsync
        )({
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.85,
        });
        const imageUri = result.assets?.[0]?.uri;
        if (result.canceled || !imageUri) {
          void analyticsEvents.receiptCapture(
            "receipt_capture_failed",
            "image",
            startedAt,
            new AnalyticsCancelledError(),
          );
          return;
        }
        const response = normalizeReceiptResponse(
          await getReceiptByRawQR(imageUri.replace("file://", "")),
        );
        if (!response) {
          Alert.alert("Чек не найден", "Не удалось распознать QR-код на фото.");
          void analyticsEvents.receiptCapture(
            "receipt_capture_failed",
            "image",
            startedAt,
          );
          return;
        }
        await saveReceipt(db, response.receipt, response.items);
        setSheetVisible(false);
        void analyticsEvents.receiptCapture(
          "receipt_capture_succeeded",
          "image",
          startedAt,
        );
      } catch (error) {
        void analyticsEvents.receiptCapture(
          "receipt_capture_failed",
          "image",
          startedAt,
          error,
        );
        Alert.alert(
          "Ошибка",
          error instanceof Error
            ? error.message
            : "Не удалось распознать QR-код на фото.",
        );
      } finally {
        setCapturing(false);
      }
    },
    [capturing, db],
  );

  const renderItem = useCallback(
    ({ item }: { item: ReceiptListItem }): ReactElement => {
      if (item.kind === "day")
        return (
          <Text style={[styles.dayTitle, { color: theme.text }]}>
            {item.title}
          </Text>
        );
      return (
        <ReceiptRow
          receipt={item.receipt}
          items={receiptItemsById.get(item.receipt.id) ?? EMPTY_ITEMS}
          onPress={onOpenReceiptDetail}
          storeAliases={storeAliases}
        />
      );
    },
    [onOpenReceiptDetail, receiptItemsById, storeAliases, theme.text],
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          receipts.length === 0 && styles.emptyList,
        ]}
        ListHeaderComponent={
          <View>
            <Text style={[styles.brand, { color: theme.text }]}>FOODLER</Text>
            <Text style={[styles.title, { color: theme.text }]}>
              Ваши покупки
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Загрузить QR"
              onPress={() => setSheetVisible(true)}
              style={({ pressed }) => [
                styles.uploadCard,
                { borderColor: theme.primary, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <View>
                <TomatoIcon height={39} width={39} />
              </View>
              <View style={styles.uploadCopy}>
                <Text
                  numberOfLines={1}
                  style={[styles.uploadTitle, { color: theme.primary }]}
                >
                  Загрузить QR
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.uploadSubtitle, { color: theme.muted }]}
                >
                  Фото чека — и покупки уже в учёте
                </Text>
              </View>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Image
              source={basket}
              style={styles.emptyImage}
              accessibilityLabel="Корзина с продуктами"
            />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Чеков пока нет
            </Text>
            <Text style={[styles.emptyText, { color: theme.muted }]}>
              Загрузите первый чек — и мы покажем ваши покупки.
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
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        showsVerticalScrollIndicator={false}
      />
      <FullModalWindow visible={sheetVisible} setVisible={closeScanningQr}>
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть загрузку QR"
            disabled={capturing}
            onPress={() => setSheetVisible(false)}
            style={styles.sheetDismiss}
          />
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <View
              style={[styles.sheetHandle, { backgroundColor: theme.outline }]}
            />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>
              Загрузить QR
            </Text>
            <Text style={[styles.sheetCopy, { color: theme.muted }]}>
              Чтобы распознавать чеки, приложению нужен доступ к камере и фото.
            </Text>
            <CaptureButton
              icon="photo-camera"
              label="Сделать фото"
              loading={capturing}
              onPress={() => void pickImage("camera")}
              themeColor={theme.primary}
            />
            <CaptureButton
              icon="image"
              label="Выбрать фото"
              loading={capturing}
              onPress={() => void pickImage("image")}
              themeColor={theme.primary}
            />
          </View>
        </View>
      </FullModalWindow>
    </View>
  );
}

function CaptureButton({
  icon,
  label,
  loading,
  onPress,
  themeColor,
}: {
  icon: "image" | "photo-camera";
  label: string;
  loading: boolean;
  onPress: () => void;
  themeColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.captureButton,
        { borderColor: themeColor, opacity: loading || pressed ? 0.65 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={themeColor} />
      ) : (
        <MaterialIcons name={icon} size={31} color={themeColor} />
      )}
      <Text style={[styles.captureText, { color: themeColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 100, paddingHorizontal: 24, paddingTop: 26 },
  emptyList: { flexGrow: 1 },
  brand: { fontSize: 16, fontWeight: "700", letterSpacing: -0.4 },
  title: {
    fontFamily: "serif",
    fontSize: 52,
    fontWeight: "500",
    letterSpacing: -2.1,
    lineHeight: 58,
    marginTop: 4,
  },
  uploadCard: {
    alignItems: "center",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    gap: 16,
    marginBottom: 17,
    marginTop: 34,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  uploadCopy: { flex: 1, minWidth: 0 },
  uploadTitle: { fontSize: 19, fontWeight: "700" },
  uploadSubtitle: { fontSize: 14, marginTop: 4 },
  dayTitle: { fontSize: 16, fontWeight: "700", marginBottom: 7, marginTop: 3 },
  receiptRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 137,
    paddingBottom: 17,
    paddingTop: 12,
  },
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
  receiptContent: { flex: 1, justifyContent: "center" },
  storeName: {
    fontFamily: "serif",
    fontSize: 23,
    fontWeight: "600",
    letterSpacing: -0.8,
    marginBottom: 4,
  },
  receiptSum: { fontFamily: "serif", fontSize: 29, letterSpacing: -1.1 },
  empty: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 80,
    paddingHorizontal: 32,
  },
  emptyImage: { height: 265, marginBottom: 8, width: 265 },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 33,
    fontWeight: "600",
    letterSpacing: -1.1,
  },
  emptyText: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    textAlign: "center",
  },
  sheetOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.42)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetDismiss: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 34,
    paddingHorizontal: 40,
    paddingTop: 14,
  },
  sheetHandle: { alignSelf: "center", borderRadius: 4, height: 5, width: 48 },
  sheetTitle: {
    fontFamily: "serif",
    fontSize: 35,
    fontWeight: "600",
    letterSpacing: -1.2,
    marginTop: 27,
    textAlign: "center",
  },
  sheetCopy: {
    fontSize: 17,
    lineHeight: 25,
    marginBottom: 24,
    marginTop: 13,
    textAlign: "center",
  },
  captureButton: {
    alignItems: "center",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    height: 64,
    justifyContent: "space-evenly",
    marginBottom: 13,
  },
  captureText: { fontSize: 20, fontWeight: "400" },
});
