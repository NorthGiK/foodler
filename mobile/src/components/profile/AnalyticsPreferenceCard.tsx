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
import type { AnalyticsIdentityMode } from "@/api/generated/types.gen";
import { useTheme } from "@/components/ThemeContext";

type PreferenceStatus = "loading" | "success" | "pending" | "error";

type Props = {
  accountMode?: AnalyticsIdentityMode;
  isAuthenticated: boolean;
  onSynced?: () => Promise<void>;
};

export function AnalyticsPreferenceCard({
  accountMode,
  isAuthenticated,
  onSynced,
}: Props) {
  const { theme } = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<PreferenceStatus>("loading");
  const [pendingTarget, setPendingTarget] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const state = await analytics.preferenceState();
      setPendingTarget(state.pendingMode === "identified");
      setEnabled(
        state.pendingMode === null
          ? (accountMode ?? state.mode) === "identified"
          : false,
      );
      setStatus(state.pendingMode === null ? "success" : "pending");
    } catch {
      setStatus("error");
    }
  }, [accountMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    async (nextEnabled: boolean) => {
      if (status === "loading") return;
      setStatus("loading");
      if (!nextEnabled) setEnabled(false);
      try {
        const result = await analytics.setPreference(
          nextEnabled ? "identified" : "anonymous",
        );
        const state = await analytics.preferenceState();
        if (result === "pending") {
          setEnabled(false);
          setPendingTarget(nextEnabled);
          setStatus("pending");
          return;
        }
        setEnabled(state.mode === "identified");
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
      : !isAuthenticated
        ? "Гостевой режим: события и отчёты о сбоях собираются без связи с аккаунтом"
        : status === "pending"
          ? "Анонимный режим уже включён; изменение будет отправлено при подключении"
          : status === "error"
            ? "Не удалось прочитать или сохранить настройку"
            : enabled
              ? "Аккаунт и устройство связаны с технической телеметрией"
              : "События и отчёты о сбоях продолжаются без связи с аккаунтом";

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
          <Text style={[styles.title, { color: theme.text }]}>
            Связь аналитики с аккаунтом
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            {subtitle}
          </Text>
        </View>
        {status === "loading" ? (
          <ActivityIndicator color={theme.primary} />
        ) : !isAuthenticated ? (
          <Text style={[styles.readOnly, { color: theme.muted }]}>
            Анонимно
          </Text>
        ) : (
          <Switch
            accessibilityLabel="Связать аналитику с аккаунтом"
            accessibilityHint="Отключение удаляет Foodler-идентификаторы, но не останавливает техническую телеметрию"
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
  readOnly: { fontSize: 13, fontWeight: "700" },
});
