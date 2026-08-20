import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { getStoreDisplayName, StoreAliases } from "../../storeAliases";
import FullModalWindow from "../FullModalWindow";
import { useTheme } from "../ThemeContext";

type Props = {
  stores: string[];
  aliases: StoreAliases;
  onSave: (store: string, alias: string) => Promise<void>;
  onRestore: (store: string) => Promise<void>;
};

export function StoreNamesSection({
  stores,
  aliases,
  onSave,
  onRestore,
}: Props) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [alias, setAlias] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uniqueStores = useMemo(
    () =>
      [
        ...new Map(
          stores.map((store) => [store.trim().toLocaleLowerCase(), store]),
        ),
      ]
        .filter(([key]) => Boolean(key))
        .map(([, store]) => store)
        .sort((first, second) => first.localeCompare(second, "ru")),
    [stores],
  );

  const close = () => {
    setVisible(false);
    setSelectedStore(null);
    setAlias("");
    setError(null);
  };

  const openEditor = (store: string) => {
    setSelectedStore(store);
    setAlias(getStoreDisplayName(store, aliases));
    setError(null);
  };

  const save = async () => {
    if (!selectedStore) return;
    if (!alias.trim()) {
      setError("Введите название магазина");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(selectedStore, alias);
      setSelectedStore(null);
    } catch {
      setError("Не удалось сохранить название. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    if (!selectedStore) return;
    setSaving(true);
    setError(null);
    try {
      await onRestore(selectedStore);
      setSelectedStore(null);
    } catch {
      setError("Не удалось восстановить название. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  const hasAlias = selectedStore
    ? getStoreDisplayName(selectedStore, aliases) !== selectedStore
    : false;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Настроить названия магазинов"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: `${theme.primary}18` }]}>
          <MaterialIcons name="storefront" size={20} color={theme.primary} />
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.eyebrow, { color: theme.secondary }]}>ЧЕКИ</Text>
          <Text style={[styles.title, { color: theme.text }]}>
            Названия магазинов
          </Text>
          <Text style={[styles.description, { color: theme.muted }]}>
            {uniqueStores.length > 0
              ? "Показывайте в чеках удобные для вас названия"
              : "Появятся после добавления первого чека"}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={theme.muted} />
      </Pressable>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.keyboardAvoiding}
      >
        <FullModalWindow visible={visible} setVisible={close}>
          <View
            style={[
              styles.modal,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {selectedStore ? (
              <ScrollView
                contentContainerStyle={styles.editorContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalHeader}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="К списку магазинов"
                    disabled={saving}
                    onPress={() => {
                      setSelectedStore(null);
                      setError(null);
                    }}
                    hitSlop={10}
                  >
                    <MaterialIcons
                      name="arrow-back"
                      size={24}
                      color={theme.text}
                    />
                  </Pressable>
                  <Text style={[styles.modalTitle, { color: theme.secondary }]}>
                    Название магазина
                  </Text>
                  <View style={styles.headerSpacer} />
                </View>
                <Text style={[styles.label, { color: theme.text }]}>
                  В чеке
                </Text>
                <TextInput
                  accessibilityLabel="Исходное название магазина"
                  editable={false}
                  selectTextOnFocus
                  style={[
                    styles.input,
                    styles.sourceInput,
                    {
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.outline,
                      color: theme.muted,
                    },
                  ]}
                  value={selectedStore}
                />
                <Text style={[styles.label, { color: theme.text }]}>
                  Показывать как
                </Text>
                <TextInput
                  accessibilityLabel="Новое название магазина"
                  autoFocus
                  editable={!saving}
                  maxLength={120}
                  onChangeText={setAlias}
                  placeholder="Продуктовый"
                  placeholderTextColor={theme.muted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.surfaceElevated,
                      borderColor: error ? theme.error : theme.outline,
                      color: theme.text,
                    },
                  ]}
                  value={alias}
                />

                {error ? (
                  <Text style={[styles.error, { color: theme.error }]}>
                    {error}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => void save()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: theme.primary,
                      opacity: saving || pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator color={theme.white} />
                  ) : (
                    <Text
                      style={[styles.primaryButtonText, { color: theme.white }]}
                    >
                      Сохранить
                    </Text>
                  )}
                </Pressable>
                {hasAlias ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => void restore()}
                    style={({ pressed }) => [
                      styles.restoreButton,
                      { opacity: saving || pressed ? 0.65 : 1 },
                    ]}
                  >
                    <Text
                      style={[styles.restoreText, { color: theme.primary }]}
                    >
                      Восстановить исходное название
                    </Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            ) : (
              <>
                <View
                  style={[
                    styles.modalBadge,
                    { backgroundColor: theme.primaryContainer },
                  ]}
                >
                  <MaterialIcons
                    name="storefront"
                    size={21}
                    color={theme.onPrimaryContainer}
                  />
                </View>
                <Text style={[styles.modalTitle, { color: theme.secondary }]}>
                  Названия магазинов
                </Text>
                <Text style={[styles.modalDescription, { color: theme.muted }]}>
                  Изменения сохраняются только на этом устройстве и не меняют
                  данные чека.
                </Text>
                <FlatList
                  data={uniqueStores}
                  keyExtractor={(store) => store}
                  ListEmptyComponent={
                    <Text style={[styles.empty, { color: theme.muted }]}>
                      Добавьте чек, чтобы настроить название магазина.
                    </Text>
                  }
                  renderItem={({ item: store }) => {
                    const displayName = getStoreDisplayName(store, aliases);
                    const renamed = displayName !== store;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Изменить название ${store}`}
                        onPress={() => openEditor(store)}
                        style={({ pressed }) => [
                          styles.storeRow,
                          {
                            borderColor: theme.border,
                            opacity: pressed ? 0.72 : 1,
                          },
                        ]}
                      >
                        <View style={styles.storeText}>
                          <Text
                            style={[styles.storeName, { color: theme.text }]}
                            numberOfLines={1}
                          >
                            {displayName}
                          </Text>
                          <Text
                            style={[styles.storeSource, { color: theme.muted }]}
                            numberOfLines={1}
                          >
                            {renamed ? `В чеке: ${store}` : "Исходное название"}
                          </Text>
                        </View>
                        <MaterialIcons
                          name="edit"
                          size={19}
                          color={theme.primary}
                        />
                      </Pressable>
                    );
                  }}
                  style={styles.list}
                  showsVerticalScrollIndicator={false}
                />
              </>
            )}
          </View>
        </FullModalWindow>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 16,
    padding: 15,
  },
  icon: {
    alignItems: "center",
    borderRadius: 13,
    height: 44,
    justifyContent: "center",
    marginRight: 13,
    width: 44,
  },
  cardContent: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { fontFamily: "serif", fontSize: 18, fontWeight: "700" },
  description: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  modal: {
    borderRadius: 26,
    borderWidth: 1,
    maxHeight: "82%",
    minHeight: 280,
    padding: 24,
  },
  keyboardAvoiding: { flex: 1 },
  editorContent: { flexGrow: 1, paddingBottom: 8 },
  modalHeader: { alignItems: "center", flexDirection: "row", marginBottom: 16 },
  headerSpacer: { width: 24 },
  modalTitle: {
    flex: 1,
    fontFamily: "serif",
    fontSize: 23,
    fontWeight: "700",
    textAlign: "center",
  },
  modalBadge: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 15,
    height: 44,
    justifyContent: "center",
    marginBottom: 8,
    width: 44,
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    marginTop: 10,
    textAlign: "center",
  },
  list: { flexGrow: 0 },
  storeRow: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 66,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  storeText: { flex: 1, marginRight: 12 },
  storeName: { fontSize: 15, fontWeight: "600" },
  storeSource: { fontSize: 12, marginTop: 4 },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 36,
    textAlign: "center",
  },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  sourceInput: {
    marginBottom: 18,
  },
  error: { fontSize: 13, marginTop: 7 },
  primaryButton: {
    alignItems: "center",
    borderRadius: 14,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 50,
  },
  primaryButtonText: { fontSize: 15, fontWeight: "700" },
  restoreButton: { alignItems: "center", marginTop: 16, paddingVertical: 10 },
  restoreText: { fontSize: 14, fontWeight: "700" },
});
