import React, { useRef, useState, useEffect } from "react";
import {
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
import { Receipt, ReceiptItem } from "../types";
import { fmtRub } from "../utils";
import {
  CashFormScreen,
  CashFormInput,
  CashFormSection,
} from "../components/ui/CashForm";

interface DraftItem {
  id: string;
  name: string;
  priceRub: string;
  quantity: string;
}

const randomChoice = (arr: string[]) =>
  arr[Math.floor(Math.random() * arr.length)];

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
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    { id: "1", name: "", priceRub: "", quantity: "1" },
  ]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef<Map<string, Animated.Value>>(new Map()).current;

  const animateItemIn = (id: string) => {
    const anim = getItemAnim(id);
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const animateItemOut = (id: string): Promise<void> => {
    return new Promise((resolve) => {
      const anim = getItemAnim(id);
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        itemAnims.delete(id);
        resolve();
      });
    });
  };

  const getItemAnim = (id: string) => {
    if (!itemAnims.has(id)) {
      itemAnims.set(id, new Animated.Value(0));
    }
    return itemAnims.get(id)!;
  };

  useEffect(() => {
    draftItems.forEach((item) => animateItemIn(item.id));
  }, []);

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
    field: keyof DraftItem,
    value: string,
  ) => {
    setDraftItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
    );
    if (errors[id] || errors[id + "_price"]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        delete next[id + "_price"];
        return next;
      });
    }
  };

  const addDraftItem = () => {
    const newId = Date.now().toString();
    const newItem: DraftItem = {
      id: newId,
      name: "",
      priceRub: "",
      quantity: "1",
    };
    setDraftItems((prev) => [...prev, newItem]);
    setTimeout(() => animateItemIn(newId), 10);
  };

  const removeDraftItem = async (id: string) => {
    await animateItemOut(id);
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
  };

  const calculateTotal = (): number => {
    return draftItems.reduce((sum, it) => {
      const price = parseFloat(it.priceRub.replace(",", ".")) || 0;
      const qty = parseFloat(it.quantity.replace(",", ".")) || 1;
      return sum + price * qty;
    }, 0);
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
    const newErrors: Record<string, boolean> = {};
    let hasErrors = false;

    if (!org.trim()) {
      newErrors["org"] = true;
      hasErrors = true;
    }
    if (!date) {
      newErrors["date"] = true;
      hasErrors = true;
    }

    const validItems = draftItems.filter((it) => it.name.trim());
    if (validItems.length === 0) {
      newErrors["items"] = true;
      hasErrors = true;
    }

    validItems.forEach((it) => {
      if (!it.name.trim()) {
        newErrors[it.id] = true;
        hasErrors = true;
      }
      if (!it.priceRub || parseFloat(it.priceRub.replace(",", ".")) <= 0) {
        newErrors[it.id + "_price"] = true;
        hasErrors = true;
      }
    });

    setErrors(newErrors);

    if (hasErrors) {
      triggerShake();
      return;
    }

    setSaving(true);
    try {
      const db = await openDb();
      const totalRub = calculateTotal();
      const receiptId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date();
      const localISO = new Date(
        now.getTime() - now.getTimezoneOffset() * 60000,
      ).toISOString();
      const receipt: Receipt = {
        id: receiptId,
        qrraw: `manual:${receiptId}`,
        organization: org.trim(),
        ticketDate: localISO,
        operationType: 3,
        totalSumRub: totalRub,
        sourceCode: 1,
        createdAt: Date.now(),
      };

      const receiptItems: ReceiptItem[] = validItems.map((it) => {
        const priceRub = parseFloat(it.priceRub.replace(",", ".")) || 0;
        const quantity = parseFloat(it.quantity.replace(",", ".")) || 1;
        return {
          receiptId,
          name: it.name.trim(),
          category: "ручное",
          priceRub,
          quantity,
          sumRub: priceRub * quantity,
        };
      });

      await saveReceipt(db, receipt, receiptItems);
      navigation.goBack();
    } catch (e) {
      console.error("Failed to save receipt", e);
    } finally {
      setSaving(false);
    }
  };

  const total = calculateTotal();

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
              clearError("org");
            }}
            placeholder={randomChoice([
              "Овощной у дома",
              "Базар",
              'Гипермаркет "СуперПродукты"',
            ])}
            error={errors["org"] ? "Введите название" : undefined}
          />
          <CashFormInput
            label="Дата"
            value={date}
            onChangeText={(v) => {
              setDate(v);
              clearError("date");
            }}
            placeholder="YYYY-MM-DD"
            error={errors["date"] ? "Введите дату" : undefined}
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
          {draftItems.map((it) => {
            const anim = getItemAnim(it.id);
            return (
              <Animated.View
                key={it.id}
                style={[
                  styles.itemDraft,
                  {
                    opacity: anim,
                    transform: [
                      {
                        translateY: anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-20, 0],
                        }),
                      },
                      {
                        scale: anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
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
                        borderColor: errors[it.id]
                          ? theme.error
                          : theme.outline,
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
                        borderColor: theme.outline,
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
              </Animated.View>
            );
          })}
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

        <AnimatedPressable scaleTo={0.97} onPress={saveReceiptData}>
          <View style={[styles.saveButton, { backgroundColor: theme.primary }]}>
            <Text style={[styles.saveButtonText, { color: theme.white }]}>
              Сохранить чек
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
