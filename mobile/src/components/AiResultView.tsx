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
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.muted }]}>
          Анализируем ваши покупки...
        </Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <MaterialIcons name="error-outline" size={64} color={theme.muted} />
        <Text style={[styles.errorText, { color: theme.muted }]}>
          Не удалось загрузить отчёт
        </Text>
        <Pressable
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

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Шапка */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={26} color={theme.text} />
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => onPin(report.id, !report.pinned)}
            style={[styles.actionBtn, { backgroundColor: theme.surface }]}
          >
            <MaterialIcons
              name={report.pinned ? "push-pin" : "bookmark-outline"}
              size={22}
              color={report.pinned ? theme.primary : theme.muted}
            />
          </Pressable>
          <Pressable
            onPress={() => onDelete(report.id)}
            style={[styles.actionBtn, { backgroundColor: theme.surface }]}
          >
            <MaterialIcons
              name="delete-outline"
              size={22}
              color={theme.error}
            />
          </Pressable>
        </View>
      </View>

      {/* Заголовок */}
      <Text style={[styles.title, { color: theme.text }]}>
        {report.response.title}
      </Text>
      <Text style={[styles.date, { color: theme.muted }]}>
        {new Date(report.createdAt).toLocaleDateString("ru", {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>

      {/* Снимок данных */}
      {report.snapshot && (
        <View
          style={[
            styles.snapshot,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.snapshotTitle, { color: theme.muted }]}>
            📋 Параметры анализа
          </Text>
          <Text style={[styles.snapshotText, { color: theme.muted }]}>
            Проанализировано {report.snapshot.receiptCount} чеков
            {report.snapshot.periodFrom
              ? ` за период ${report.snapshot.periodFrom} — ${report.snapshot.periodTo || "настоящее время"}`
              : ""}
            {report.snapshot.totalSpent != null
              ? ` на сумму ${report.snapshot.totalSpent.toFixed(0)} ₽`
              : ""}
          </Text>
        </View>
      )}

      {/* Резюме */}
      {report.response.summary ? (
        <Text style={[styles.summary, { color: theme.muted }]}>
          {report.response.summary}
        </Text>
      ) : null}

      {/* Секции */}
      {report.response.sections.map((section, i) => (
        <AiSectionRenderer key={i} section={section} />
      ))}

      {/* Разделитель */}
      <View style={styles.separator}>
        <View
          style={[styles.separatorLine, { backgroundColor: theme.border }]}
        />
        <Text style={[styles.separatorText, { color: theme.muted }]}>
          ↓ Действия
        </Text>
        <View
          style={[styles.separatorLine, { backgroundColor: theme.border }]}
        />
      </View>

      {/* Кнопки действий */}
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.actionCard, { backgroundColor: theme.primary }]}
          onPress={() => onPin(report.id, !report.pinned)}
        >
          <MaterialIcons
            name={report.pinned ? "push-pin" : "bookmark-border"}
            size={22}
            color={theme.white}
          />
          <Text style={[styles.actionCardText, { color: theme.white }]}>
            {report.pinned ? "Открепить" : "Сохранить"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.actionCard, { backgroundColor: theme.surface }]}
          onPress={() => shareReport(report)}
        >
          <MaterialIcons name="share" size={22} color={theme.text} />
          <Text style={[styles.actionCardText, { color: theme.text }]}>
            Поделиться
          </Text>
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
    fontSize: 16,
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  date: {
    fontSize: 14,
    marginBottom: 20,
  },
  snapshot: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  snapshotTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  snapshotText: {
    fontSize: 14,
    lineHeight: 20,
  },
  summary: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
    fontStyle: "italic",
  },
  separator: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  separatorLine: {
    flex: 1,
    height: 1,
  },
  separatorText: {
    fontSize: 12,
    fontWeight: "600",
    marginHorizontal: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  actionCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
  },
  actionCardText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
