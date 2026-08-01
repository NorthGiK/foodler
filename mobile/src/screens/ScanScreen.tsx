import { getReceiptByRawQR, getReceiptFromQR } from "@/api/client";
import { useTheme } from "@/components/ThemeContext";
import { Theme } from "@/themes";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import {
  useCameraPermissions
} from "expo-camera";
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from "expo-image-picker";
import * as fs from "expo-file-system";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  AnimatedPressable,
  useStaggeredFadeIn,
} from "../components/animations";
import { normalizeReceiptResponse, saveReceipt } from "../storage";

interface Props {
  db: any;
  onReceiptSaved: () => void;
  switchTab: (tab: string) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function ScanScreen({ db, onReceiptSaved, switchTab }: Props) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [camPermission, reqCamPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [qrRaw, setQrRaw] = useState("");
  const lastScan = useRef(0);
  const SCAN_THROTTLE_MS = 2000;
  const scrollY = useRef(new Animated.Value(0));

  const pickImage = async (type: "camera" | "image") => {
    console.debug("querying photo/image")
    const requestPermissions = type === "image" ? requestMediaLibraryPermissionsAsync : requestCameraPermissionsAsync;
    console.debug(requestPermissions.toString());

    console.debug("getting permissiongs");
    const perm = await requestPermissions();
    console.debug("permissions were got");

    if (!perm) {
      console.debug("perrmisions not granted")
      Alert.alert(
        "Упс...",
        "Нет доступа к фото — нет сканирования электронных чеков",
      );
      return;
    }


    const launcher = type === "image" ? launchImageLibraryAsync : launchCameraAsync;
    console.debug(launcher.toString());
    const img = await launcher({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 1,
    });

    if (img.canceled) {
      console.debug("taking image was canceled");
      return;
    }
    if (!img.assets) {
      console.debug("image has no property `assets`");
      return;
    }
    console.debug(img.assets[0].uri);

    setBusy(true);
    try {
      if (!db) {
        console.debug("no db in ScanScreen");
        return;
      }

      console.debug("trying to get receipt by qr");
      const res = await getReceiptByRawQR(img.assets[0].uri.replace("file://", ""));
      const resp = normalizeReceiptResponse(res);
      if (!resp) return;

      await saveReceipt(db, resp.receipt, resp.items);
      onReceiptSaved();
      return true;
    }
    catch (e) {
      console.debug(e);
      Alert.alert(
        "Ошибка",
        (e as Error).message || "Не удалось распознать QR-код. Введите его вручную в поле ниже.",
      );
    } finally {
      setBusy(false);
    }
  };

  async function scanQR(type: "raw" | "parsed", data: string): Promise<undefined | true> {
    if (!db) return;

    try {
      const toCall = type === "raw" ? getReceiptByRawQR : getReceiptFromQR;
      const res = await toCall(data);
      console.log(res);
      const resp = normalizeReceiptResponse(res);
      if (!resp) return;

      await saveReceipt(db, resp.receipt, resp.items);
      onReceiptSaved();
      return true;
    } catch (e) {
      return;
    }
  }

  const handle = async (raw: string) => {
    if (busy) return;
    setBusy(true);
    const res = await scanQR("parsed", raw);
    setBusy(false);
    if (!res) {
      Alert.alert("Чек не найден");
    }
  };

  const cardStyles = useStaggeredFadeIn(3, 80);

  const hasCamera = camPermission?.granted ?? false;

  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      if (busy || now - lastScan.current < SCAN_THROTTLE_MS) return;
      lastScan.current = now;
      setQrRaw(data);
      handle(data);
    },
    [busy],
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY.current } } }],
        { useNativeDriver: false },
      )}
      scrollEventThrottle={16}
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
        <AnimatedPressable scaleTo={0.98} onPress={hasCamera ? () => pickImage("camera") : reqCamPermission}>
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
                style={[
                  styles.permTitle,
                  { color: theme.onPrimaryContainer },
                ]}
              >
                {hasCamera ? "Сделать фото" : "Разрешить доступ к камере"}
              </Text>
              <Text
                style={[
                  styles.permSubtitle,
                  { color: theme.onPrimaryContainer },
                ]}
              >
                {hasCamera ? "Сделайте фото с qr-кодом чека и он будет сохранен" : "Без разрешения к камере нельзя сделать фото"}
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
        onPress={() => pickImage("image")}
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
            onPress={() => handle(qrRaw.trim())}
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
    cameraCard: {
      borderRadius: 20,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      ...shadow(2),
    },
    cameraFrame: {
      height: 350,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: "#000",
      borderWidth: 1,
      position: "relative",
    },
    camera: { flex: 1 },
    focusOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
    },
    focusFrame: {
      width: SCREEN_WIDTH - 160,
      height: SCREEN_WIDTH - 160,
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: "dashed",
      justifyContent: "center",
      alignItems: "center",
    },
    focusCorner: {
      position: "absolute",
      width: 20,
      height: 20,
      borderWidth: 3,
    },
    focusTopLeft: {
      top: -2,
      left: -2,
      borderBottomWidth: 0,
      borderRightWidth: 0,
      borderTopLeftRadius: 12,
    },
    focusTopRight: {
      top: -2,
      right: -2,
      borderBottomWidth: 0,
      borderLeftWidth: 0,
      borderTopRightRadius: 12,
    },
    focusBottomLeft: {
      bottom: -2,
      left: -2,
      borderTopWidth: 0,
      borderRightWidth: 0,
      borderBottomLeftRadius: 12,
    },
    focusBottomRight: {
      bottom: -2,
      right: -2,
      borderTopWidth: 0,
      borderLeftWidth: 0,
      borderBottomRightRadius: 12,
    },
    focusHint: {
      position: "absolute",
      bottom: -30,
      fontSize: 13,
      fontWeight: "600",
      opacity: 0.9,
    },
    zoomContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 12,
      paddingHorizontal: 4,
    },
    zoomSliderTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      position: "relative",
    },
    zoomSliderFill: {
      height: "100%",
      borderRadius: 2,
    },
    zoomThumb: {
      position: "absolute",
      top: -8,
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 3,
      marginLeft: -10,
      ...shadow(3),
    },
    zoomButtons: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginTop: 8,
    },
    zoomButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    zoomButtonText: {
      fontSize: 12,
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
