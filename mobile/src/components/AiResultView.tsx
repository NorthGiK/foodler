import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useTheme } from "./ThemeContext";
import { AiSectionRenderer } from "./AiSectionRenderer";
import { AiReport } from "../ai/types";
import LogoBrand from "./ui/LogoBrand";

interface Props {
  report: AiReport | null;
  loading: boolean;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

export function AiResultView({
  report,
  loading,
  onPin,
  onDelete,
  onBack,
}: Props) {
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <LogoBrand />
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Анализируем ваши покупки...
        </Text>
        <Text style={[styles.stateHint, { color: theme.muted }]}>
          Собираем факты из сохранённых чеков
        </Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.stateEyebrow, { color: theme.primary }]}>
          FOODLER AI / ОТЧЁТ
        </Text>
        <MaterialIcons name="error-outline" size={48} color={theme.primary} />
        <Text style={[styles.errorText, { color: theme.text }]}>
          Не удалось загрузить отчёт
        </Text>
        <Text style={[styles.stateHint, { color: theme.muted }]}>
          Вернитесь к списку и попробуйте открыть его ещё раз.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Вернуться к отчётам"
          style={[styles.backButton, { backgroundColor: theme.primary }]}
          onPress={onBack}
        >
          <Text style={[styles.backButtonText, { color: theme.white }]}>
            Назад
          </Text>
        </Pressable>
      </View>
    );
  }

  const shareReport = async (r: AiReport) => {
    const dateStr = new Date(r.createdAt).toLocaleDateString("ru", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    // Форматируем отчёт в красивый текст
    let text = `📊 *${r.response.title}*\n`;
    text += `📅 ${dateStr}\n\n`;

    if (r.snapshot) {
      text += `📋 *Параметры анализа:*\n`;
      text += `• Чеков: ${r.snapshot.receiptCount}`;
      if (r.snapshot.periodFrom) {
        text += `\n• Период: ${r.snapshot.periodFrom} — ${r.snapshot.periodTo || "настоящее время"}`;
      }
      if (r.snapshot.totalSpent != null) {
        text += `\n• Сумма: ${r.snapshot.totalSpent.toFixed(0)} ₽`;
      }
      text += "\n\n";
    }

    if (r.response.summary) {
      text += `*Резюме:* ${r.response.summary}\n\n`;
    }

    for (const section of r.response.sections) {
      text += `*${section.title}*\n`;
      switch (section.type) {
        case "text":
          text += `${section.text}\n`;
          break;
        case "score":
          text += `Оценка: ${section.value}${section.max ? `/${section.max}` : ""}\n`;
          break;
        case "list":
          section.items.forEach((item) => {
            text += `• ${item}\n`;
          });
          break;
        case "products":
          section.products.forEach((p) => {
            text += `• ${p.name} — ${p.reason}${p.price ? ` (${p.price} ₽)` : ""}\n`;
          });
          break;
        case "chart":
          section.labels.forEach((label, i) => {
            text += `• ${label}: ${section.values[i]}\n`;
          });
          break;
      }
      text += "\n";
    }

    text += `\n—\nFood Tracker AI`;

    try {
      await Share.share({ message: text, title: r.response.title });
    } catch {
      // ignore
    }
  };

  const formattedDate = formatReportDate(report.createdAt);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад к отчётам"
          onPress={onBack}
          style={styles.backBtn}
        >
          <MaterialIcons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>
            FOODLER AI / ОТЧЁТ
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {report.response.title}
          </Text>
          <Text style={[styles.date, { color: theme.muted }]}>
            {formattedDate}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              report.pinned ? "Открепить отчёт" : "Закрепить отчёт"
            }
            onPress={() => onPin(report.id, !report.pinned)}
            style={styles.actionBtn}
          >
            <MaterialIcons
              name={report.pinned ? "push-pin" : "bookmark-outline"}
              size={22}
              color={report.pinned ? theme.primary : theme.muted}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Удалить отчёт"
            onPress={() => onDelete(report.id)}
            style={styles.actionBtn}
          >
            <MaterialIcons
              name="delete-outline"
              size={22}
              color={theme.error}
            />
          </Pressable>
        </View>
      </View>

      {report.response.summary ? (
        <View style={[styles.summary, { borderLeftColor: theme.primary }]}>
          <Text style={[styles.summaryLabel, { color: theme.primary }]}>
            ГЛАВНОЕ
          </Text>
          <Text style={[styles.summaryText, { color: theme.text }]}>
            {report.response.summary}
          </Text>
        </View>
      ) : null}

      {report.response.sections.map((section, i) => (
        <AiSectionRenderer key={i} section={section} />
      ))}

      <Text style={[styles.disclaimer, { color: theme.muted }]}>
        Рекомендации носят информационный характер и могут содержать ошибки.
        Проверяйте важные решения самостоятельно.
      </Text>

      <View style={styles.actionHeading}>
        <Text style={[styles.actionHeadingText, { color: theme.primary }]}>
          ДЕЙСТВИЯ
        </Text>
        <View
          style={[styles.actionHeadingLine, { backgroundColor: theme.primary }]}
        />
      </View>

      <View
        style={[
          styles.actionList,
          { borderTopColor: theme.border, borderBottomColor: theme.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            report.pinned ? "Открепить отчёт" : "Сохранить отчёт"
          }
          style={styles.actionRow}
          onPress={() => onPin(report.id, !report.pinned)}
        >
          <MaterialIcons
            name={report.pinned ? "push-pin" : "bookmark-border"}
            size={21}
            color={theme.primary}
          />
          <Text style={[styles.actionText, { color: theme.text }]}>
            {report.pinned ? "Открепить" : "Сохранить"}
          </Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Поделиться отчётом"
          style={[
            styles.actionRow,
            styles.actionDivider,
            { borderTopColor: theme.border },
          ]}
          onPress={() => shareReport(report)}
        >
          <MaterialIcons name="share" size={21} color={theme.primary} />
          <Text style={[styles.actionText, { color: theme.text }]}>
            Поделиться
          </Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Удалить отчёт из действий"
          style={[
            styles.actionRow,
            styles.actionDivider,
            { borderTopColor: theme.border },
          ]}
          onPress={() => onDelete(report.id)}
        >
          <MaterialIcons name="delete-outline" size={21} color={theme.error} />
          <Text style={[styles.actionText, { color: theme.error }]}>
            Удалить отчёт
          </Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.muted} />
        </Pressable>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    fontFamily: "Georgia",
    fontSize: 24,
    marginTop: 18,
    textAlign: "center",
  },
  stateEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.4,
    marginBottom: 14,
  },
  stateHint: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: "center",
  },
  errorText: {
    fontFamily: "Georgia",
    fontSize: 24,
    marginTop: 14,
    marginBottom: 4,
    textAlign: "center",
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
    marginTop: 24,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  backBtn: {
    width: 30,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  headerActions: {
    flexDirection: "row",
    gap: 2,
  },
  actionBtn: {
    width: 30,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontFamily: "Georgia",
    fontSize: 30,
    fontWeight: "400",
    letterSpacing: -0.5,
    lineHeight: 35,
  },
  date: {
    fontSize: 14,
    marginTop: 7,
  },
  snapshot: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 7,
    marginBottom: 24,
  },
  snapshotTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  snapshotRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 30,
    paddingVertical: 2,
  },
  snapshotLabel: {
    fontSize: 13,
  },
  snapshotValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 16,
    textAlign: "right",
  },
  summary: {
    borderLeftWidth: 3,
    paddingLeft: 14,
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  summaryText: {
    fontFamily: "Georgia",
    fontSize: 20,
    lineHeight: 28,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 24,
    textAlign: "left",
  },
  actionHeading: {
    marginBottom: 10,
    marginTop: 6,
  },
  actionHeadingText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.4,
  },
  actionHeadingLine: {
    height: 3,
    marginTop: 8,
    width: 34,
  },
  actionList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 28,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 58,
    paddingVertical: 12,
  },
  actionDivider: {
    borderTopWidth: 1,
  },
  actionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 14,
  },
});

function formatReportDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}
