import { getReceiptByRawQR, getReceiptFromQR } from "@/api/client";
import { useTheme } from "@/components/ThemeContext";
import { Theme } from "@/themes";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useCameraPermissions } from "expo-camera";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AnimatedPressable,
  useStaggeredFadeIn,
} from "../components/animations";
import { AnalyticsCancelledError, analyticsEvents } from "../analytics/facade";
import { normalizeReceiptResponse, saveReceipt } from "../storage";

interface Props {
  db: SQLiteDatabase | null;
  switchTab: (tab: "receipts") => void;
}

export function ScanScreen({ db, switchTab }: Props) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [camPermission, reqCamPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [qrRaw, setQrRaw] = useState("");

  const pickImage = async (type: "camera" | "image") => {
    if (busy) return;
    setBusy(true);
    const startedAt = Date.now();
    void analyticsEvents.receiptCapture(
      "receipt_capture_started",
      "image",
      startedAt,
    );
    try {
      const requestPermissions =
        type === "image"
          ? requestMediaLibraryPermissionsAsync
          : requestCameraPermissionsAsync;
      const permission = await requestPermissions();
      if (!permission.granted) {
        Alert.alert(
          "Нет доступа",
          type === "image"
            ? "Разрешите доступ к фотографиям, чтобы выбрать изображение чека."
            : "Разрешите доступ к камере, чтобы сфотографировать чек.",
        );
        void analyticsEvents.receiptCapture(
          "receipt_capture_failed",
          "image",
          startedAt,
          new AnalyticsCancelledError(),
        );
        return;
      }

      const launcher =
        type === "image" ? launchImageLibraryAsync : launchCameraAsync;
      const image = await launcher({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.85,
      });
      const imageUri = image.assets?.[0]?.uri;
      if (image.canceled || !imageUri || !db) {
        void analyticsEvents.receiptCapture(
          "receipt_capture_failed",
          "image",
          startedAt,
          new AnalyticsCancelledError(),
        );
        return;
      }

      const res = await getReceiptByRawQR(imageUri.replace("file://", ""));
      const resp = normalizeReceiptResponse(res);
      if (!resp) {
        Alert.alert("Чек не найден", "Не удалось распознать QR-код на фото.");
        void analyticsEvents.receiptCapture(
          "receipt_capture_failed",
          "image",
          startedAt,
        );
        return;
      }

      await saveReceipt(db, resp.receipt, resp.items);
      void analyticsEvents.receiptCapture(
        "receipt_capture_succeeded",
        "image",
        startedAt,
      );
      switchTab("receipts");
      return true;
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
          : "Не удалось распознать QR-код. Введите его вручную.",
      );
    } finally {
      setBusy(false);
    }
  };

  async function scanQR(type: "raw" | "parsed", data: string) {
    if (!db) return false;

    try {
      const toCall = type === "raw" ? getReceiptByRawQR : getReceiptFromQR;
      const res = await toCall(data);
      const resp = normalizeReceiptResponse(res);
      if (!resp) return false;

      await saveReceipt(db, resp.receipt, resp.items);
      switchTab("receipts");
      return true;
    } catch {
      return false;
    }
  }

  const handle = async (raw: string) => {
    if (busy) return;
    setBusy(true);
    const startedAt = Date.now();
    void analyticsEvents.receiptCapture(
      "receipt_capture_started",
      "qr",
      startedAt,
    );
    const res = await scanQR("parsed", raw);
    setBusy(false);
    if (res) {
      void analyticsEvents.receiptCapture(
        "receipt_capture_succeeded",
        "qr",
        startedAt,
      );
    } else {
      void analyticsEvents.receiptCapture(
        "receipt_capture_failed",
        "qr",
        startedAt,
      );
      Alert.alert("Чек не найден");
    }
  };

  const cardStyles = useStaggeredFadeIn(3, 80);

  const hasCamera = camPermission?.granted ?? false;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={cardStyles[0]}>
        <Text style={[styles.title, { color: theme.text }]}>
          Сканирование чека
        </Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Отсканируйте QR-код, выберите изображение с ним или введите его
          вручную
        </Text>
      </Animated.View>

      <Animated.View style={cardStyles[1]}>
        <AnimatedPressable
          scaleTo={0.98}
          onPress={
            hasCamera
              ? () => void pickImage("camera")
              : () => void reqCamPermission()
          }
          disabled={busy}
        >
          <View
            style={[
              styles.permCard,
              {
                backgroundColor: theme.primaryContainer,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.permIcon,
                { backgroundColor: theme.primary + "22" },
              ]}
            >
              <MaterialIcons
                name="camera-alt"
                size={28}
                color={theme.primary}
              />
            </View>
            <View style={styles.permTextContainer}>
              <Text
                style={[styles.permTitle, { color: theme.onPrimaryContainer }]}
              >
                {hasCamera ? "Сделать фото" : "Разрешить доступ к камере"}
              </Text>
              <Text
                style={[
                  styles.permSubtitle,
                  { color: theme.onPrimaryContainer },
                ]}
              >
                {hasCamera
                  ? "Сделайте фото с qr-кодом чека и он будет сохранен"
                  : "Без разрешения к камере нельзя сделать фото"}
              </Text>
            </View>
            <View
              style={[
                styles.permChevron,
                { backgroundColor: theme.primary + "15" },
              ]}
            >
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={theme.primary}
              />
            </View>
          </View>
        </AnimatedPressable>
      </Animated.View>

      {/* Pick Photo button - styled nicely */}
      <AnimatedPressable
        style={cardStyles[2]}
        scaleTo={0.97}
        onPress={() => void pickImage("image")}
        disabled={busy}
      >
        <View
          style={[
            styles.photoPickerCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View
            style={[
              styles.photoPickerIcon,
              { backgroundColor: theme.primary + "15" },
            ]}
          >
            <MaterialIcons
              name="photo-library"
              size={24}
              color={theme.primary}
            />
          </View>
          <View style={styles.photoPickerText}>
            <Text style={[styles.photoPickerTitle, { color: theme.text }]}>
              Выбрать фото
            </Text>
            <Text style={[styles.photoPickerSubtitle, { color: theme.muted }]}>
              Изображение с QR-кодом чека
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={theme.muted} />
        </View>
      </AnimatedPressable>

      <Animated.View style={cardStyles[2]}>
        <View
          style={[
            styles.inputCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.inputLabel, { color: theme.text }]}>
            QR-код чека
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.outline,
                color: theme.text,
              },
            ]}
            value={qrRaw}
            onChangeText={setQrRaw}
            placeholder="Введите QR-код или отсканируйте"
            placeholderTextColor={theme.muted}
            multiline
          />
          <AnimatedPressable
            scaleTo={0.97}
            style={[
              styles.submitBtn,
              { backgroundColor: theme.primary },
              (!qrRaw.trim() || busy) && styles.submitBtnDisabled,
            ]}
            disabled={!qrRaw.trim() || busy}
            onPress={() => void handle(qrRaw.trim())}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <MaterialIcons name="send" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Отправить</Text>
              </View>
            )}
          </AnimatedPressable>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const getStyles = (theme: Theme) => {
  function shadow(e: number) {
    return {
      elevation: e,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: e / 2 },
      shadowOpacity: 0.12,
      shadowRadius: e,
    };
  }

  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: 20,
      paddingBottom: 100,
    },
    title: {
      fontSize: 32,
      fontWeight: "800",
      marginTop: 12,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 15,
      marginTop: 6,
      marginBottom: 28,
      lineHeight: 22,
    },
    permCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 20,
      padding: 18,
      marginBottom: 20,
      borderWidth: 1,
      gap: 14,
    },
    permIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: "center",
      alignItems: "center",
    },
    permTextContainer: {
      flex: 1,
    },
    permTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 4,
    },
    permSubtitle: {
      fontSize: 13,
      opacity: 0.8,
      lineHeight: 18,
    },
    permChevron: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
    },
    photoPickerCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 20,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      gap: 14,
      ...shadow(2),
    },
    photoPickerIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: "center",
      alignItems: "center",
    },
    photoPickerText: {
      flex: 1,
    },
    photoPickerTitle: {
      fontSize: 16,
      fontWeight: "600",
    },
    photoPickerSubtitle: {
      fontSize: 13,
      marginTop: 2,
    },
    inputCard: {
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      gap: 12,
      ...shadow(2),
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: "600",
    },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      minHeight: 60,
      textAlignVertical: "center",
    },
    submitBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 14,
      borderRadius: 16,
      ...shadow(4),
    },
    submitBtnDisabled: {
      opacity: 0.5,
    },
    submitBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },
  });
};
