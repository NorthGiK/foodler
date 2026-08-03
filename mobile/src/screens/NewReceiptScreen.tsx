import React, { useRef, useState } from "react";
import {
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useTheme } from "../components/ThemeContext";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { openDb, saveReceipt } from "../storage";
import { AnimatedPressable } from "../components/animations";
import { fmtRub } from "../utils";
import {
  CashFormScreen,
  CashFormInput,
  CashFormSection,
} from "../components/ui/CashForm";
import {
  buildManualReceipt,
  calculateManualReceiptTotal,
  createDraftItem,
  validateManualReceipt,
  type ReceiptDraftItem,
} from "../features/receipts/manualReceipt";

export function NewReceiptScreen() {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [org, setOrg] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const [draftItems, setDraftItems] = useState<ReceiptDraftItem[]>(() => [
    createDraftItem(),
  ]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const clearError = (key: string) => {
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const updateDraftItem = (
    id: string,
    field: keyof ReceiptDraftItem,
    value: string,
  ) => {
    setDraftItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
    );
    const errorKey =
      field === "name"
        ? id
        : field === "priceRub"
          ? `${id}_price`
          : `${id}_quantity`;
    clearError(errorKey);
    clearError("items");
  };

  const addDraftItem = () => {
    setDraftItems((prev) => [...prev, createDraftItem()]);
    clearError("items");
  };

  const removeDraftItem = (id: string) => {
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
  };

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const saveReceiptData = async () => {
    if (saving) return;
    const draft = { organization: org, date, items: draftItems };
    const newErrors = validateManualReceipt(draft);

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      triggerShake();
      return;
    }

    setSaving(true);
    try {
      const db = await openDb();
      const result = buildManualReceipt(draft);
      await saveReceipt(db, result.receipt, result.items);
      navigation.goBack();
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить чек. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  const total = calculateManualReceiptTotal(draftItems);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.headerButton}
        >
          <MaterialIcons name="close" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Новый чек
        </Text>
        <View style={styles.headerButton} />
      </View>
      <CashFormScreen title="Новый чек">
        <CashFormSection title="Основная информация">
          <CashFormInput
            label="Магазин / организация"
            value={org}
            onChangeText={(v) => {
              setOrg(v);
              clearError("organization");
            }}
            placeholder="Название магазина"
            error={errors.organization ? "Введите название" : undefined}
          />
          <CashFormInput
            label="Дата"
            value={date}
            onChangeText={(v) => {
              setDate(v);
              clearError("date");
            }}
            placeholder="YYYY-MM-DD"
            error={errors.date ? "Введите корректную дату" : undefined}
          />
        </CashFormSection>

        <CashFormSection title="Сумма">
          <View
            style={[
              styles.totalBox,
              {
                backgroundColor: theme.surfaceElevated,
                borderColor: errors["items"] ? theme.error : theme.border,
              },
            ]}
          >
            <Text style={[styles.totalText, { color: theme.text }]}>
              {fmtRub(total)}
            </Text>
          </View>
        </CashFormSection>

        <CashFormSection title="Товары">
          {draftItems.map((it) => (
            <View key={it.id} style={styles.itemDraft}>
              <View style={styles.itemRow}>
                <TextInput
                  value={it.name}
                  onChangeText={(v) => {
                    updateDraftItem(it.id, "name", v);
                    clearError(it.id);
                  }}
                  style={[
                    styles.itemInput,
                    {
                      color: theme.text,
                      borderColor: errors[it.id] ? theme.error : theme.outline,
                      backgroundColor: theme.surfaceElevated,
                    },
                  ]}
                  placeholder="Название"
                  placeholderTextColor={theme.muted}
                />
                <TextInput
                  value={it.priceRub}
                  onChangeText={(v) => {
                    updateDraftItem(it.id, "priceRub", v);
                    clearError(it.id + "_price");
                  }}
                  keyboardType="decimal-pad"
                  style={[
                    styles.itemInput,
                    {
                      color: theme.text,
                      borderColor: errors[it.id + "_price"]
                        ? theme.error
                        : theme.outline,
                      backgroundColor: theme.surfaceElevated,
                    },
                  ]}
                  placeholder="Цена"
                  placeholderTextColor={theme.muted}
                />
                <TextInput
                  value={it.quantity}
                  onChangeText={(v) => updateDraftItem(it.id, "quantity", v)}
                  keyboardType="decimal-pad"
                  style={[
                    styles.itemInput,
                    {
                      color: theme.text,
                      borderColor: errors[`${it.id}_quantity`]
                        ? theme.error
                        : theme.outline,
                      backgroundColor: theme.surfaceElevated,
                    },
                  ]}
                  placeholder="Кол-во"
                  placeholderTextColor={theme.muted}
                />
                <AnimatedPressable
                  scaleTo={0.85}
                  onPress={() => removeDraftItem(it.id)}
                >
                  <View
                    style={[
                      styles.iconButton,
                      { backgroundColor: theme.error + "15" },
                    ]}
                  >
                    <MaterialIcons
                      name="delete-outline"
                      size={18}
                      color={theme.error}
                    />
                  </View>
                </AnimatedPressable>
              </View>
            </View>
          ))}
          <AnimatedPressable scaleTo={0.97} onPress={addDraftItem}>
            <View
              style={[
                styles.addProductBtn,
                {
                  backgroundColor: theme.primary + "12",
                  borderColor: theme.primary + "30",
                },
              ]}
            >
              <MaterialIcons name="add" size={20} color={theme.primary} />
              <Text style={[styles.addProductText, { color: theme.primary }]}>
                Добавить товар
              </Text>
            </View>
          </AnimatedPressable>
        </CashFormSection>

        <AnimatedPressable
          scaleTo={0.97}
          onPress={() => void saveReceiptData()}
          disabled={saving}
        >
          <View
            style={[
              styles.saveButton,
              { backgroundColor: theme.primary, opacity: saving ? 0.65 : 1 },
            ]}
          >
            <Text style={[styles.saveButtonText, { color: theme.white }]}>
              {saving ? "Сохранение…" : "Сохранить чек"}
            </Text>
          </View>
        </AnimatedPressable>
      </CashFormScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerButton: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    padding: 20,
    paddingBottom: 100,
    gap: 16,
  },
  field: { gap: 8 },
  fieldError: { marginBottom: 4 },
  label: { fontWeight: "600", fontSize: 14 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  totalBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  totalText: { fontSize: 18, fontWeight: "800" },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  smallButtonText: { fontWeight: "700", fontSize: 13 },
  itemDraft: {
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    flex: 1,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  addProductBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  addProductText: {
    fontSize: 14,
    fontWeight: "600",
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
