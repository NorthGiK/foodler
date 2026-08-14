import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { analytics } from "@/analytics/service";
import { useTheme } from "@/components/ThemeContext";

type PreferenceStatus = "loading" | "success" | "pending" | "error";

type Props = {
  accountEnabled?: boolean;
  onSynced?: () => Promise<void>;
};

export function AnalyticsPreferenceCard({ accountEnabled, onSynced }: Props) {
  const { theme } = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<PreferenceStatus>("loading");
  const [pendingTarget, setPendingTarget] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const state = await analytics.preferenceState();
      setPendingTarget(state.pendingPreference);
      setEnabled(
        state.pendingPreference === null
          ? (accountEnabled ?? state.enabled)
          : false,
      );
      setStatus(state.pendingPreference === null ? "success" : "pending");
    } catch {
      setStatus("error");
    }
  }, [accountEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    async (nextEnabled: boolean) => {
      if (status === "loading") return;
      setStatus("loading");
      if (!nextEnabled) setEnabled(false);
      try {
        const result = await analytics.setPreference(nextEnabled);
        const state = await analytics.preferenceState();
        if (result === "pending") {
          setEnabled(false);
          setPendingTarget(nextEnabled);
          setStatus("pending");
          return;
        }
        setEnabled(state.enabled);
        setPendingTarget(null);
        setStatus("success");
        await onSynced?.();
      } catch {
        setEnabled(false);
        setStatus("error");
      }
    },
    [onSynced, status],
  );

  const subtitle =
    status === "loading"
      ? "Сохраняем настройку…"
      : status === "pending"
        ? "Изменение сохранено и будет отправлено при подключении"
        : status === "error"
          ? "Не удалось прочитать или сохранить настройку"
          : enabled
            ? "Помогает улучшать Foodler"
            : "Новые события не собираются";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.primary + "15" }]}>
          <MaterialIcons name="insights" size={24} color={theme.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]}>Аналитика</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            {subtitle}
          </Text>
        </View>
        {status === "loading" ? (
          <ActivityIndicator color={theme.primary} />
        ) : (
          <Switch
            accessibilityLabel="Разрешить продуктовую аналитику"
            accessibilityHint="Управляет сбором обезличенных событий использования"
            disabled={status === "pending" || status === "error"}
            value={enabled}
            onValueChange={(value) => void update(value)}
            trackColor={{ false: theme.border, true: theme.primary + "80" }}
            thumbColor={enabled ? theme.primary : theme.muted}
          />
        )}
      </View>
      {(status === "pending" || status === "error") && (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            status === "pending" && pendingTarget !== null
              ? void update(pendingTarget)
              : void load()
          }
          style={styles.retry}
        >
          <Text style={[styles.retryText, { color: theme.primary }]}>
            Повторить
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
  },
  row: { alignItems: "center", flexDirection: "row" },
  icon: {
    alignItems: "center",
    borderRadius: 16,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  copy: { flex: 1, marginHorizontal: 14 },
  title: { fontSize: 17, fontWeight: "700" },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  retry: { alignSelf: "flex-start", marginLeft: 62, paddingTop: 10 },
  retryText: { fontSize: 14, fontWeight: "700" },
});
