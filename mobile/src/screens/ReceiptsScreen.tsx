import { useTheme } from "@/components/ThemeContext";
import { Theme } from "@/themes";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, getAccessToken } from "../api/client";
import { AnimatedPressable, FadeInView } from "../components/animations";
import { AddButton } from "../components/ui";
import { deleteReceipt, loadReceiptItems, saveReceipt } from "../storage";
import { Receipt, ReceiptItem } from "../types";
import { fmtDate, fmtRub } from "../utils";

const randomChoice = (arr: string[]) =>
  arr[Math.floor(Math.random() * arr.length)];

interface Props {
  db: any;
  receipts: Receipt[];
  onSaved?: () => void;
  onOpenReceiptDetail?: (receipt: Receipt) => void;
  onNewReceipt?: () => void;
}

interface DraftItem {
  id: string;
  name: string;
  priceRub: string;
  quantity: string;
}

export function ReceiptsScreen({
  db,
  receipts,
  onSaved,
  onOpenReceiptDetail,
  onNewReceipt,
}: Props) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef<Map<string, Animated.Value>>(new Map()).current;
  const receiptAnimValues = useRef<Map<string, Animated.Value>>(
    new Map(),
  ).current;
  const itemsAnimValues = useRef<Animated.Value[]>([]).current;
  const modalFadeAnim = useRef(new Animated.Value(0)).current;

  const open = async (r: Receipt) => {
    if (!db) return;
    const det = await loadReceiptItems(db, r.id);
    setSelected(r);
    setItems(det);
    modalFadeAnim.setValue(0);
    Animated.timing(modalFadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleDeleteReceipt = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const token = await getAccessToken();
      if (token) {
        try {
          await api.deleteReceipt(selected.id);
        } catch (e) {
          console.warn("Failed to delete receipt from server", e);
        }
      }
      await deleteReceipt(db, selected.id);
      setDeleteModalVisible(false);
      setSelected(null);
      setItems([]);
      onSaved?.();
    } catch (e) {
      console.error("Failed to delete receipt", e);
      Alert.alert("Ошибка", "Не удалось удалить чек");
    } finally {
      setDeleting(false);
    }
  };

  const getReceiptAnim = (id: string) => {
    if (!receiptAnimValues.has(id)) {
      receiptAnimValues.set(id, new Animated.Value(0));
    }
    return receiptAnimValues.get(id)!;
  };

  const animateReceiptIn = (id: string, index: number) => {
    const anim = getReceiptAnim(id);
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 350,
      delay: index * 60,
      useNativeDriver: true,
    }).start();
  };

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

  useEffect(() => {
    if (items.length > 0) {
      itemsAnimValues.length = 0;
      items.forEach((_, i) => {
        const anim = new Animated.Value(0);
        itemsAnimValues.push(anim);
        Animated.timing(anim, {
          toValue: 1,
          duration: 300,
          delay: i * 50,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [items]);

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

  const saveManualReceipt = async () => {
    if (!db) return;

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

    try {
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
      setAddOpen(false);
      setOrg("");
      setDate(new Date().toISOString().slice(0, 10));
      setDraftItems([
        { id: Date.now().toString(), name: "", priceRub: "", quantity: "1" },
      ]);
      setErrors({});
      onSaved?.();
    } catch (e) {
      console.error("Failed to save receipt", e);
    }
  };

  const total = calculateTotal();

  const renderReceiptItem = ({
    item,
    index,
  }: {
    item: Receipt;
    index: number;
  }) => {
    const anim = getReceiptAnim(item.id);
    animateReceiptIn(item.id, index);
    const animatedStyle = {
      opacity: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
      transform: [
        {
          translateX: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [-30, 0],
          }),
        },
      ],
    };
    return (
      <Animated.View style={animatedStyle}>
        <AnimatedPressable scaleTo={0.97} onPress={() => open(item)}>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.leftAccent}>
              <View
                style={[styles.accentDot, { backgroundColor: theme.primary }]}
              />
            </View>
            <View style={styles.row}>
              <View style={styles.infoContainer}>
                <Text
                  style={[styles.org, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {item.organization}
                </Text>
                <Text style={[styles.meta, { color: theme.muted }]}>
                  {fmtDate(item.ticketDate)}
                </Text>
              </View>
              <Text style={[styles.sum, { color: theme.primary }]}>
                {fmtRub(item.totalSumRub)}
              </Text>
            </View>
          </View>
        </AnimatedPressable>
      </Animated.View>
    );
  };

  return (
    <>
      <FlatList
        contentContainerStyle={[
          styles.list,
          {
            paddingTop:
              styles.addButtonText.fontSize +
              styles.addButton.gap * 2 +
              styles.addButton.paddingVertical * 2 +
              styles.addButtonContainer.paddingTop * 2,
          },
        ]}
        data={receipts}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={
          <FadeInView delay={200}>
            <Text style={[styles.empty, { color: theme.muted }]}>
              Нет чеков
            </Text>
          </FadeInView>
        }
        renderItem={renderReceiptItem}
        showsVerticalScrollIndicator={false}
      />
      <View style={styles.addButtonContainer}>
        <AddButton
          title="Добавить чек"
          icon="add"
          onPress={() => setAddOpen(true)}
        />
      </View>

      {/* Receipt detail modal */}
      <Modal
        visible={!!selected}
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView style={[styles.modal, { backgroundColor: theme.bg }]}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <FadeInView>
              <View style={styles.modalHeader}>
                <Text
                  numberOfLines={10}
                  lineBreakMode='clip'
                  lineBreakStrategyIOS="hangul-word"
                  style={[styles.modalTitle, { maxWidth: width * 0.7, color: theme.text }]}
                >
                  {selected?.organization}
                </Text>
                <Pressable onPress={() => setSelected(null)}>
                  <Text style={[styles.close, { color: theme.primary }]}>
                    Закрыть
                  </Text>
                </Pressable>
              </View>
            </FadeInView>
            <FadeInView delay={100} slideDistance={20}>
              <Text style={[styles.bigSum, { color: theme.primary }]}>
                {selected ? fmtRub(selected.totalSumRub) : ""}
              </Text>
            </FadeInView>
            {items.map((it, i) => {
              const anim = itemsAnimValues[i];
              if (!anim) return null;
              const animatedStyle = {
                opacity: anim,
                transform: [
                  {
                    translateY: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              };
              return (
                <Animated.View key={it.id ?? it.name} style={animatedStyle}>
                  <View
                    style={[
                      styles.itemRow,
                      { borderBottomColor: theme.border },
                    ]}
                  >
                    <Text style={[styles.itemName, { color: theme.text }]}>
                      {it.name}
                    </Text>
                    <Text style={[styles.itemPrice, { color: theme.text }]}>
                      {fmtRub(it.sumRub)}
                    </Text>
                    <Text style={[styles.itemMeta, { color: theme.muted }]}>
                      {it.category} · {it.quantity} × {fmtRub(it.priceRub)}
                    </Text>
                  </View>
                </Animated.View>
              );
            })}

            {/* Delete button at bottom of items */}
            <FadeInView delay={200}>
              <AnimatedPressable
                scaleTo={0.95}
                onPress={() => setDeleteModalVisible(true)}
              >
                <View
                  style={[
                    styles.deleteButton,
                    { backgroundColor: theme.error + "15" },
                  ]}
                >
                  <MaterialIcons name="delete-outline" size={18} color={theme.error} />
                  <Text style={[styles.deleteButtonText, { color: theme.error }]}>
                    Удалить чек
                  </Text>
                </View>
              </AnimatedPressable>
            </FadeInView>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => !deleting && setDeleteModalVisible(false)}
        >
          <Pressable
            style={[
              styles.dialog,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
            onPress={() => { }}
          >
            <View style={styles.dialogIconWrapper}>
              <View style={[styles.dialogIconCircle, { backgroundColor: theme.error + "15" }]}>
                <MaterialIcons name="delete-forever" size={32} color={theme.error} />
              </View>
            </View>
            <Text style={[styles.dialogTitle, { color: theme.text }]}>
              Удалить чек
            </Text>
            <Text style={[styles.dialogMessage, { color: theme.muted }]}>
              Вы уверенны, что хотите навсегда удалить чек?
            </Text>
            <View style={styles.dialogButtons}>
              <Pressable
                style={[
                  styles.dialogButton,
                  styles.dialogButtonCancel,
                  { backgroundColor: theme.surfaceElevated },
                ]}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deleting}
              >
                <Text style={[styles.dialogButtonCancelText, { color: theme.text }]}>
                  Отказаться
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.dialogButton,
                  styles.dialogButtonConfirm,
                  { backgroundColor: theme.error },
                ]}
                onPress={handleDeleteReceipt}
                disabled={deleting}
              >
                <Text style={[styles.dialogButtonConfirmText, { color: theme.white }]}>
                  {deleting ? "Удаление..." : "Согласиться"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add receipt modal */}
      <Modal
        visible={addOpen}
        animationType="slide"
        onRequestClose={() => setAddOpen(false)}
      >
        <SafeAreaView style={[styles.modal, { backgroundColor: theme.bg }]}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <FadeInView>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Новый чек
                </Text>
                <Pressable onPress={() => setAddOpen(false)}>
                  <Text style={[styles.close, { color: theme.primary }]}>
                    Закрыть
                  </Text>
                </Pressable>
              </View>
            </FadeInView>
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <FadeInView delay={80} slideDistance={15}>
                <View
                  style={[styles.field, errors["org"] && styles.fieldError]}
                >
                  <Text style={[styles.label, { color: theme.text }]}>
                    Магазин / организация
                  </Text>
                  <TextInput
                    value={org}
                    onChangeText={(v) => {
                      setOrg(v);
                      clearError("org");
                    }}
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        borderColor: errors["org"]
                          ? theme.error
                          : theme.outline,
                        backgroundColor: theme.surfaceElevated,
                      },
                    ]}
                    placeholder={randomChoice([
                      "Овощной у дома",
                      "Базар",
                      'Гипермаркет "СуперПродукты"',
                    ])}
                    placeholderTextColor={theme.muted}
                  />
                </View>
              </FadeInView>
              <FadeInView delay={140} slideDistance={15}>
                <View
                  style={[styles.field, errors["date"] && styles.fieldError]}
                >
                  <Text style={[styles.label, { color: theme.text }]}>
                    Дата
                  </Text>
                  <TextInput
                    value={date}
                    onChangeText={(v) => {
                      setDate(v);
                      clearError("date");
                    }}
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        borderColor: errors["date"]
                          ? theme.error
                          : theme.outline,
                        backgroundColor: theme.surfaceElevated,
                      },
                    ]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.muted}
                  />
                </View>
              </FadeInView>
              <FadeInView delay={200} slideDistance={15}>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.text }]}>
                    Итоговая сумма
                  </Text>
                  <View
                    style={[
                      styles.totalBox,
                      {
                        backgroundColor: theme.surfaceElevated,
                        borderColor: errors["items"]
                          ? theme.error
                          : theme.outline,
                      },
                    ]}
                  >
                    <Text style={[styles.totalText, { color: theme.text }]}>
                      {fmtRub(total)}
                    </Text>
                  </View>
                </View>
              </FadeInView>
              <FadeInView delay={260} slideDistance={15}>
                <View
                  style={[styles.field, errors["items"] && styles.fieldError]}
                >
                  <View style={styles.rowHeader}>
                    <Text style={[styles.label, { color: theme.text }]}>
                      Товары
                    </Text>
                    <AnimatedPressable scaleTo={0.93} onPress={addDraftItem}>
                      <View
                        style={[
                          styles.smallButton,
                          { backgroundColor: theme.primary },
                        ]}
                      >
                        <MaterialIcons
                          name="add"
                          size={16}
                          color={theme.white}
                        />
                        <Text
                          style={[
                            styles.smallButtonText,
                            { color: theme.white },
                          ]}
                        >
                          Добавить
                        </Text>
                      </View>
                    </AnimatedPressable>
                  </View>
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
                        <TextInput
                          value={it.name}
                          onChangeText={(v) => {
                            updateDraftItem(it.id, "name", v);
                            clearError(it.id);
                          }}
                          style={[
                            styles.input,
                            {
                              flex: 2,
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
                            styles.input,
                            {
                              flex: 1,
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
                          onChangeText={(v) =>
                            updateDraftItem(it.id, "quantity", v)
                          }
                          keyboardType="decimal-pad"
                          style={[
                            styles.input,
                            {
                              flex: 1,
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
                      </Animated.View>
                    );
                  })}
                </View>
              </FadeInView>
              <FadeInView delay={320} slideDistance={15}>
                <AnimatedPressable scaleTo={0.96} onPress={saveManualReceipt}>
                  <View
                    style={[
                      styles.saveButton,
                      { backgroundColor: theme.primary },
                    ]}
                  >
                    <Text
                      style={[styles.saveButtonText, { color: theme.white }]}
                    >
                      Сохранить чек
                    </Text>
                  </View>
                </AnimatedPressable>
              </FadeInView>
            </Animated.View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { padding: 16, paddingBottom: 100 },
    empty: { textAlign: "center", marginTop: 40, fontSize: 15 },
    topBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    addButtonContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingTop: 12,
      paddingHorizontal: 16,
    },
    addButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 14,
      alignSelf: "flex-start",
    },
    addButtonText: { fontWeight: "700", fontSize: 15 },
    card: {
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      elevation: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
    },
    leftAccent: {
      width: 3,
      height: 40,
      borderRadius: 2,
      marginRight: 14,
      justifyContent: "center",
    },
    accentDot: {
      width: 3,
      height: 30,
      borderRadius: 2,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    infoContainer: {
      flex: 1,
    },
    org: { fontWeight: "600", fontSize: 15, marginBottom: 4 },
    sum: { fontWeight: "800", fontSize: 16 },
    meta: { fontSize: 12 },
    modal: { flex: 1 },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    modalTitle: { fontSize: 20, fontWeight: "700" },
    close: { fontWeight: "700", fontSize: 15, },
    bigSum: {
      fontSize: 36,
      fontWeight: "900",
      marginBottom: 8,
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
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: "center",
      alignItems: "center",
    },
    saveButton: {
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: "center",
      marginTop: 8,
    },
    saveButtonText: { fontWeight: "800", fontSize: 16 },
    itemRow: {
      borderBottomWidth: 1,
      paddingVertical: 12,
      gap: 4,
    },
    itemName: { fontWeight: "500", fontSize: 15 },
    itemPrice: { fontWeight: "700", fontSize: 15 },
    itemMeta: { fontSize: 12 },
    deleteButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
      marginTop: 8,
    },
    deleteButtonText: {
      fontWeight: "700",
      fontSize: 14,
    },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
    },
    dialog: {
      width: "100%",
      borderRadius: 24,
      padding: 24,
      borderWidth: 1,
      alignItems: "center",
    },
    dialogIconWrapper: {
      marginBottom: 16,
    },
    dialogIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: "center",
      alignItems: "center",
    },
    dialogTitle: {
      fontSize: 20,
      fontWeight: "800",
      marginBottom: 8,
      textAlign: "center",
    },
    dialogMessage: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginBottom: 24,
    },
    dialogButtons: {
      flexDirection: "row",
      gap: 12,
      width: "100%",
    },
    dialogButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: "center",
    },
    dialogButtonCancel: {
      borderWidth: 0,
    },
    dialogButtonCancelText: {
      fontWeight: "700",
      fontSize: 15,
    },
    dialogButtonConfirm: {
      borderWidth: 0,
    },
    dialogButtonConfirmText: {
      fontWeight: "800",
      fontSize: 15,
    },
  });