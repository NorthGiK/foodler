import FullModalWindow from "@/components/FullModalWindow";
import ScanQrButton from "@/components/ui/ScanQrButton";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from "expo-image-picker";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AnalyticsCancelledError, analyticsEvents } from "../analytics/facade";
import { getReceiptByRawQR } from "../api/client";
import { useTheme } from "../components/ThemeContext";
import { normalizeReceiptResponse, saveReceipt } from "../storage";
import { getStoreDisplayName, type StoreAliases } from "../storeAliases";
import type { Theme } from "../themes";
import type { Receipt, ReceiptItem } from "../types";
import { fmtRub, toTitleCase } from "../utils";

const basket = require("../assets/ProductBasket.png") as number;
const EMPTY_ITEMS: ReceiptItem[] = [];

type JoinedItem = ReceiptItem & { ticketDate?: string };
type ReceiptListItem =
  | { key: string; kind: "month"; title: string }
  | { key: string; kind: "receipt"; receipt: Receipt };

interface Props {
  db: SQLiteDatabase | null;
  receipts: Receipt[];
  joinedItems: JoinedItem[];
  onRefresh: () => Promise<void>;
  onOpenReceiptDetail: (receipt: Receipt) => void;
  storeAliases: StoreAliases;
  scanRequestId?: number;
}

interface ReceiptRowProps {
  receipt: Receipt;
  itemsLength: string;
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

  const dateFmt = new Intl.DateTimeFormat("ru-RU", {day: "numeric", month: "long"});
  const formatedDate = dateFmt.format(date);

  return toTitleCase(formatedDate);
}

function monthTitle(ticketDate: string): string {
  const date = new Date(ticketDate);
  const dateFmt = new Intl.DateTimeFormat("ru-RU", {month: "long"});
  const formatedDate = dateFmt.format(date);

  return toTitleCase(formatedDate);
}

function buildListItems(receipts: readonly Receipt[]): ReceiptListItem[] {
  const list: ReceiptListItem[] = [];
  let previousDay = "";
  for (const receipt of receipts) {
    const title = monthTitle(receipt.ticketDate);
    if (title !== previousDay) {
      list.push({ key: `day-${receipt.id}`, kind: "month", title });
      previousDay = title;
    }
    list.push({ key: receipt.id, kind: "receipt", receipt });
  }
  return list;
}

const ReceiptRow = memo(function ReceiptRow({
  receipt,
  itemsLength,
  onPress,
  storeAliases,
}: ReceiptRowProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const storeName = getStoreDisplayName(receipt.organization, storeAliases);

  // Сделать правильное окончание для Позиции
  let receiptPosition = itemsLength + " ";
  if (itemsLength === "1") receiptPosition += "Позиция"
  else if (
    itemsLength === "2" ||
    itemsLength === "3" ||
    itemsLength === "4"
  ) receiptPosition += "Позиции"
  else receiptPosition += "Позиций"

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Открыть чек ${storeName}`}
      onPress={() => onPress(receipt)}
      style={({ pressed }) => [
        styles.receiptRow,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.receiptContent} >
        <Text style={styles.boldSemiTitle}>
          {dayTitle(receipt.ticketDate)}
        </Text>
        <Text
          numberOfLines={1}
          style={styles.storeName}
        >
          {storeName}
        </Text>
        <Text style={styles.semiTitle}>
          {receiptPosition + " в покупке"}
        </Text>
      </View>
      <Text style={styles.receiptSum}>
        {fmtRub(receipt.totalSumRub, false)}
      </Text>
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
  scanRequestId = 0,
}: Props) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [qrError, setQrError] = useState(false);
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

  useEffect(() => {
    if (scanRequestId <= 0) return;
    setQrError(false);
    setSheetVisible(true);
  }, [scanRequestId]);

  const closeScanningQr = () => {
    if (!capturing) {
      setSheetVisible(false);
      setQrError(false);
    }
  };

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
          setQrError(true);
          void analyticsEvents.receiptCapture(
            "receipt_capture_failed",
            "image",
            startedAt,
          );
          return;
        }
        await saveReceipt(db, response.receipt, response.items);
        setSheetVisible(false);
        setQrError(false);
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
        setQrError(true);
      } finally {
        setCapturing(false);
      }
    },
    [capturing, db],
  );

  const renderItem = useCallback(
    ({ item }: { item: ReceiptListItem }): ReactElement => {
      if (item.kind === "month")
        return (
          <Text style={styles.dayTitle}>
            {item.title}
          </Text>
        );

      const receiptItems = receiptItemsById.get(item.key);
      let receiptItemsCount = receiptItems ? receiptItems.length.toString() : "Многа";

      return (
        <ReceiptRow
          receipt={item.receipt}
          itemsLength={receiptItemsCount}
          onPress={onOpenReceiptDetail}
          storeAliases={storeAliases}
        />
      );
    },
    [onOpenReceiptDetail, receiptItemsById, storeAliases, theme.text],
  );

  return (
    <View style={styles.screen}>
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
            <Text style={[styles.title, { color: theme.text }]}>
              Покупки
            </Text>
            <Text style={styles.semiTitle} >
              Сохраняйте покупки и следите за расходами
            </Text>
            <ScanQrButton
              onPress={() => {
                setQrError(false);
                setSheetVisible(true);
              }}
            />
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
        showsVerticalScrollIndicator={true}
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
          <View style={styles.sheet}>
            <View
              style={styles.sheetHandle}
            />
            {qrError ? (
              <QrErrorState
                capturing={capturing}
                onChooseAnother={() => void pickImage("image")}
                onClose={closeScanningQr}
                theme={theme}
              />
            ) : (
              <>
                <Text style={styles.sheetTitle}>
                  Загрузить QR
                </Text>
                <Text style={styles.sheetCopy}>
                  Чтобы распознавать чеки, приложению нужен доступ к камере и
                  фото.
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
              </>
            )}
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
  const { theme } = useTheme();
  const styles = getStyles(theme);

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

function QrErrorState({
  capturing,
  onChooseAnother,
  onClose,
  theme,
}: {
  capturing: boolean;
  onChooseAnother: () => void;
  onClose: () => void;
  theme: Theme;
}) {
  const styles = getStyles(theme);
  return (
    <View>
      <MaterialIcons
        accessibilityLabel="Ошибка распознавания QR"
        name="error-outline"
        size={58}
        color={theme.error}
        style={styles.qrErrorIcon}
      />
      <Text style={[styles.qrErrorTitle, { color: theme.text }]}>
        Не удалось распознать QR
      </Text>
      <Text style={[styles.qrErrorCopy, { color: theme.muted }]}>
        Убедитесь, что QR-код на фото хорошо виден и не размыт, затем попробуйте
        ещё раз.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Выбрать другое фото"
        disabled={capturing}
        onPress={onChooseAnother}
        style={({ pressed }) => [
          styles.qrErrorButton,
          {
            backgroundColor: theme.error,
            opacity: capturing || pressed ? 0.65 : 1,
          },
        ]}
      >
        {capturing ? (
          <ActivityIndicator color={theme.white} />
        ) : (
          <MaterialIcons name="image" size={24} color={theme.white} />
        )}
        <Text style={[styles.qrErrorButtonText, { color: theme.white }]}>
          Выбрать другое фото
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
        disabled={capturing}
        onPress={onClose}
        style={({ pressed }) => [
          styles.qrErrorClose,
          { opacity: capturing || pressed ? 0.65 : 1 },
        ]}
      >
        <Text style={[styles.qrErrorCloseText, { color: theme.text }]}>
          Закрыть
        </Text>
      </Pressable>
    </View>
  );
}

const getStyles = (theme: Theme) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  list: { paddingBottom: 100, paddingHorizontal: 24, paddingTop: 26 },
  emptyList: { flexGrow: 1 },
  brand: { fontSize: 16, fontWeight: "700", letterSpacing: -0.4 },
  title: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 4,
  },
  semiTitle: {
    fontSize: 11,
    color: theme.muted,
  },
  boldSemiTitle: {
    fontSize: 11,
    color: theme.muted,
    fontWeight: "700",
  },
  dayTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 7,
  },
  receiptRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    borderRadius: 20,
    backgroundColor: theme.primaryContainer,
    flexDirection: "row",
    paddingBottom: 17,
    paddingTop: 12,
    marginBottom: 12,
  },
  receiptContent: {
    flex: 1,
    paddingLeft: 16,
    rowGap: 6,
  },
  storeName: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
    color: theme.text
  },
  receiptSum: {
    fontSize: 23,
    letterSpacing: -1.3,
    color: theme.text,
  },
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
    backgroundColor: theme.primaryContainer,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 34,
    paddingHorizontal: 40,
    paddingTop: 14,
  },
  sheetHandle: { alignSelf: "center", backgroundColor: theme.muted, borderRadius: 4, height: 5, width: 48 },
  sheetTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: theme.text,
    letterSpacing: -1.2,
    marginTop: 27,
    textAlign: "center",
  },
  sheetCopy: {
    color: theme.muted,
    fontSize: 14,
    lineHeight: 25,
    marginBottom: 24,
    marginTop: 13,
    textAlign: "center",
  },
  captureButton: {
    alignItems: "center",
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    height: 64,
    justifyContent: "space-evenly",
    marginBottom: 13,
  },
  captureText: { fontSize: 20, fontWeight: "400" },
  qrErrorIcon: { alignSelf: "center", marginTop: 27 },
  qrErrorTitle: {
    fontFamily: "serif",
    fontSize: 31,
    fontWeight: "600",
    letterSpacing: -1,
    marginTop: 16,
    textAlign: "center",
  },
  qrErrorCopy: {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 24,
    marginTop: 12,
    textAlign: "center",
  },
  qrErrorButton: {
    alignItems: "center",
    borderRadius: 9,
    flexDirection: "row",
    gap: 10,
    height: 58,
    justifyContent: "center",
  },
  qrErrorButtonText: { fontSize: 17, fontWeight: "700" },
  qrErrorClose: { alignItems: "center", paddingVertical: 18 },
  qrErrorCloseText: { fontSize: 16, fontWeight: "600" },
});
