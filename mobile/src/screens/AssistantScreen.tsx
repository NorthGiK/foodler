import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { AiServiceError, generateAiResponse } from "../ai/llmService";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  deleteAiReport,
  initAiReportsTable,
  loadAiReports,
  saveAiReport,
  togglePinReport,
} from "../ai/storage";
import { AiActionType, AiReport } from "../ai/types";
import { AiResultView } from "../components/AiResultView";
import {
  AnimatedPressable,
  FadeInView,
  useStaggeredFadeIn,
} from "../components/animations";
import { loadProfile } from "../profileStorage";
import { useTheme } from "../components/ThemeContext";
import { ActionCard, HeroCard, ReportCard } from "../components/ui";
import type { FamilyMember, Receipt, ReceiptItem } from "../types";
import { useAuth } from "@/api/auth";
import type { MaterialIconName } from "../components/icons";

interface Props {
  db: SQLiteDatabase | null;
  receipts: Receipt[];
  joinedItems: (ReceiptItem & { ticketDate?: string })[];
}

type ViewMode = "menu" | "result";

interface AssistantAction {
  title: string;
  icon: MaterialIconName;
  color: string;
  action: AiActionType;
}

export function AssistantScreen({ db, receipts, joinedItems }: Props) {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [viewMode, setViewMode] = useState<ViewMode>("menu");
  const [currentReport, setCurrentReport] = useState<AiReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentReports, setRecentReports] = useState<AiReport[]>([]);
  const [showAllReports, setShowAllReports] = useState(false);
  const [errorKind, setErrorKind] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const loadRecentReports = useCallback(async () => {
    if (!db) return;
    try {
      const reports = await loadAiReports(db);
      setRecentReports(reports);
    } catch {
      console.warn("AI reports could not be loaded");
    }
  }, [db]);

  useEffect(() => {
    if (db) {
      void initAiReportsTable(db).catch(() => {
        console.warn("AI report storage could not be initialized");
      });
      void loadRecentReports();
    }
  }, [db, loadRecentReports]);

  const openReport = useCallback((report: AiReport) => {
    setCurrentReport(report);
    setViewMode("result");
  }, []);

  const runAnalysis = useCallback(
    async (action: AiActionType) => {
      if (!db || receipts.length === 0) return;
      if (!isAuthenticated) {
        setErrorKind("auth");
        setErrorMessage(
          "Использовать ассистента могут только авторизованные пользователи",
        );
        setViewMode("result");
        return;
      }

      setLoading(true);
      setErrorKind(null);
      setErrorMessage("");
      setViewMode("result");

      try {
        const totalSpent = receipts.reduce(
          (s, r) => s + Math.abs(r.totalSumRub),
          0,
        );
        const dates = receipts
          .map((receipt) => receipt.ticketDate)
          .filter(Boolean)
          .sort();
        const snapshot = {
          receiptCount: receipts.length,
          periodFrom: dates[0]
            ? new Date(dates[0]).toLocaleDateString("ru")
            : undefined,
          periodTo: dates[dates.length - 1]
            ? new Date(dates[dates.length - 1]).toLocaleDateString("ru")
            : undefined,
          totalSpent,
          receiptIds: receipts.map((r) => r.id),
        };

        let profileMembers: FamilyMember[] | undefined;
        try {
          const profile = await loadProfile();
          const members: FamilyMember[] = [];

          if (profile.name) {
            members.push({
              name: profile.name,
              age: profile.age,
              heightCm: profile.heightCm,
              weightKg: profile.weightKg,
              gender: profile.gender,
              dietaryPreferences: profile.dietaryPreferences,
              healthGoals: profile.healthGoals,
              additionalInfo: profile.additionalInfo,
            });
          }

          members.push(...profile.familyMembers);

          if (members.length > 0) {
            profileMembers = members;
          }
        } catch {
          // ignore if profile not available
        }

        const result = await generateAiResponse(action, {
          receipts,
          items: joinedItems,
          periodFrom: snapshot.periodFrom,
          periodTo: snapshot.periodTo,
          members: profileMembers,
        });
        const report = await saveAiReport(db, action, snapshot, result);

        openReport(report);
        await loadRecentReports();
      } catch (error: unknown) {
        setErrorKind(error instanceof AiServiceError ? error.kind : "unknown");
        setErrorMessage(
          error instanceof Error ? error.message : "Что-то пошло не так.",
        );
      } finally {
        setLoading(false);
      }
    },
    [db, receipts, joinedItems, isAuthenticated, loadRecentReports, openReport],
  );

  const handlePin = useCallback(
    async (id: string, pinned: boolean) => {
      if (!db) return;
      await togglePinReport(db, id, pinned);
      await loadRecentReports();
      if (currentReport?.id === id) {
        setCurrentReport((prev) => (prev ? { ...prev, pinned } : null));
      }
    },
    [db, loadRecentReports, currentReport],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!db) return;
      await deleteAiReport(db, id);
      await loadRecentReports();
      setViewMode("menu");
      setCurrentReport(null);
    },
    [db, loadRecentReports],
  );

  const handleBack = useCallback(() => {
    setViewMode("menu");
    setCurrentReport(null);
  }, []);

  const actions: AssistantAction[] = [
    {
      title: "Оценить покупки",
      icon: "analytics",
      color: "#007AFF",
      action: "analysis",
    },
    {
      title: "Сэкономить",
      icon: "savings",
      color: "#34C759",
      action: "save_money",
    },
    {
      title: "Полезнее",
      icon: "favorite",
      color: "#FF3B30",
      action: "health",
    },
    {
      title: "Рецепты",
      icon: "restaurant",
      color: "#FF9500",
      action: "recipe",
    },
    {
      title: "Состав",
      icon: "science",
      color: "#007AFF",
      action: "ingredients",
    },
    {
      title: "Корзина",
      icon: "shopping-cart",
      color: "#AF52DE",
      action: "cart",
    },
    {
      title: "Заканчивается",
      icon: "schedule",
      color: "#FF9500",
      action: "habits",
    },
    {
      title: "Рацион",
      icon: "spa",
      color: "#34C759",
      action: "diet",
    },
  ];

  const cardStyles = useStaggeredFadeIn(actions.length + 2, 60);

  if (viewMode === "result") {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {errorKind ? (
          <View style={styles.center}>
            <View
              style={[
                styles.errorIcon,
                { backgroundColor: theme.error + "15" },
              ]}
            >
              <MaterialIcons
                name={
                  errorKind === "network"
                    ? "wifi-off"
                    : errorKind === "server"
                      ? "cloud-off"
                      : errorKind === "rate_limit"
                        ? "timer"
                        : "error-outline"
                }
                size={48}
                color={theme.error}
              />
            </View>
            <Text style={[styles.errorText, { color: theme.text }]}>
              {errorMessage}
            </Text>
            <Pressable
              onPress={handleBack}
              style={[styles.retryButton, { backgroundColor: theme.primary }]}
            >
              <Text style={[styles.retryButtonText, { color: theme.white }]}>
                Назад
              </Text>
            </Pressable>
          </View>
        ) : (
          <AiResultView
            report={currentReport}
            loading={loading}
            onPin={handlePin}
            onDelete={handleDelete}
            onBack={handleBack}
          />
        )}
      </View>
    );
  }

  const displayReports = showAllReports
    ? recentReports
    : recentReports.slice(0, 5);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={cardStyles[0]}>
        <Text style={[styles.title, { color: theme.text }]}>AI-помощник</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Анализируйте покупки и получайте рекомендации
        </Text>
      </Animated.View>

      <Animated.View style={cardStyles[1]}>
        <HeroCard
          title="Общий анализ"
          subtitle="Полный анализ расходов, полезности покупок и привычек"
          icon="auto-awesome"
          iconColor="#007AFF"
          onPress={() => runAnalysis("analysis")}
        />
      </Animated.View>

      <Animated.View style={[cardStyles[2], { marginTop: 28 }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Быстрые действия
          </Text>
          <View
            style={[
              styles.sectionLine,
              { backgroundColor: theme.primary + "20" },
            ]}
          />
        </View>
      </Animated.View>

      <View style={styles.quickGrid}>
        {actions.map((a, i) => (
          <Animated.View
            key={a.title}
            style={[cardStyles[i + 3], styles.quickCardWrapper]}
          >
            <ActionCard
              title={a.title}
              icon={a.icon}
              color={a.color}
              onPress={() => runAnalysis(a.action)}
            />
          </Animated.View>
        ))}
      </View>

      <Animated.View style={cardStyles[actions.length + 2]}>
        <AnimatedPressable
          scaleTo={0.97}
          onPress={() => navigation.navigate("Ask")}
        >
          <View
            style={[
              styles.askButton,
              {
                backgroundColor: theme.primary,
                shadowColor: theme.primary,
              },
            ]}
          >
            <View style={styles.askButtonContent}>
              <MaterialIcons name="chat" size={22} color={theme.white} />
              <Text style={[styles.askButtonText, { color: theme.white }]}>
                Задать вопрос
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={theme.white} />
          </View>
        </AnimatedPressable>
      </Animated.View>

      {recentReports.length > 0 && (
        <FadeInView delay={400} slideDistance={20}>
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Последние рекомендации
              </Text>
              <View
                style={[
                  styles.sectionLine,
                  { backgroundColor: theme.primary + "20" },
                ]}
              />
            </View>

            {displayReports.map((report) => (
              <ReportCard
                key={report.id}
                title={report.response.title}
                date={formatRelativeDate(report.createdAt)}
                action={report.action}
                pinned={report.pinned}
                onPress={() => openReport(report)}
              />
            ))}

            {recentReports.length > 5 && !showAllReports && (
              <Pressable
                onPress={() => setShowAllReports(true)}
                style={[styles.showMore, { borderColor: theme.border }]}
              >
                <Text style={[styles.showMoreText, { color: theme.primary }]}>
                  Показать ещё ({recentReports.length - 5})
                </Text>
              </Pressable>
            )}
          </View>
        </FadeInView>
      )}
    </ScrollView>
  );
}

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин. назад`;
  if (hours < 24) return `${hours} ч. назад`;
  if (days < 7) return `${days} дн. назад`;

  return new Date(timestamp).toLocaleDateString("ru", {
    day: "numeric",
    month: "long",
  });
}

const styles = StyleSheet.create({
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
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  sectionLine: {
    width: 40,
    height: 3,
    borderRadius: 2,
  },
  recentSection: {
    marginTop: 20,
  },
  showMore: {
    alignItems: "center",
    paddingVertical: 14,
    borderTopWidth: 1,
    marginTop: 4,
  },
  showMoreText: {
    fontSize: 15,
    fontWeight: "600",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  quickCardWrapper: {
    width: "48%",
    marginBottom: 12,
  },
  askButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 20,
    elevation: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  askButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  askButtonText: {
    fontSize: 17,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 24,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
