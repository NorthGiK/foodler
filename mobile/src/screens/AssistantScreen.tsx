import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Animated,
  Image,
  Modal,
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
import { FadeInView, useStaggeredFadeIn } from "../components/animations";
import { loadProfile } from "../profileStorage";
import { useTheme } from "../components/ThemeContext";
import { ReportCard } from "../components/ui";
import type { FamilyMember, Receipt, ReceiptItem } from "../types";
import { useAuth } from "@/api/auth";
import { analyticsEvents } from "@/analytics/facade";
import type { MaterialIconName } from "../components/icons";
import FullModalWindow from "@/components/FullModalWindow";
import LogoBrand from "@/components/ui/LogoBrand";

const basket = require("../assets/ProductBasket.png") as number;

interface Props {
  db: SQLiteDatabase | null;
  receipts: Receipt[];
  joinedItems: (ReceiptItem & { ticketDate?: string })[];
}

type ViewMode = "menu" | "result";

interface AssistantAction {
  title: string;
  subtitle: string;
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
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showAuthSheet, setShowAuthSheet] = useState(false);
  const [errorKind, setErrorKind] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    void analyticsEvents.aiScreenViewed();
  }, []);

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
    if (!db) return;
    let cancelled = false;

    void (async () => {
      try {
        await initAiReportsTable(db);
        if (!cancelled) await loadRecentReports();
      } catch {
        console.warn("AI report storage could not be initialized");
      }
    })();

    return () => {
      cancelled = true;
    };
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
      const startedAt = Date.now();
      void analyticsEvents.ai("ai_action_started", action, startedAt);

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
        void analyticsEvents.ai("ai_action_succeeded", action, startedAt);
      } catch (error: unknown) {
        void analyticsEvents.ai("ai_action_failed", action, startedAt, error);
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

  const handleActionPress = useCallback(
    (action: AiActionType) => {
      if (!isAuthenticated) {
        setShowAuthSheet(true);
        return;
      }
      void runAnalysis(action);
    },
    [isAuthenticated, runAnalysis],
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
      title: "Полезнее",
      subtitle: "Как сделать рацион лучше",
      icon: "spa",
      color: "#587448",
      action: "health",
    },
    {
      title: "Сэкономить",
      subtitle: "Где можно тратить меньше",
      icon: "sell",
      color: "#D5663D",
      action: "save_money",
    },
    {
      title: "Список покупок",
      subtitle: "Составим список по вашим чекам",
      icon: "shopping-bag",
      color: "#D69B21",
      action: "cart",
    },
    {
      title: "Что приготовить",
      subtitle: "Идеи на основе ваших продуктов",
      icon: "soup-kitchen",
      color: "#526B3C",
      action: "recipe",
    },
  ];

  const extraActions: AssistantAction[] = [
    {
      title: "Оценить покупки",
      subtitle: "Разберём расходы и привычки",
      icon: "analytics",
      color: "#C44935",
      action: "analysis",
    },
    {
      title: "Состав продуктов",
      subtitle: "Проверим ингредиенты и состав",
      icon: "science",
      color: "#5B6875",
      action: "ingredients",
    },
    {
      title: "Заканчивается",
      subtitle: "Найдём регулярные покупки",
      icon: "schedule",
      color: "#C8813B",
      action: "habits",
    },
    {
      title: "Рацион",
      subtitle: "Соберём более сбалансированный план",
      icon: "restaurant-menu",
      color: "#587448",
      action: "diet",
    },
  ];

  const cardStyles = useStaggeredFadeIn(4, 60);

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
        <LogoBrand />
        <Text style={[styles.title, { color: theme.text }]}>Foodler AI</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Персональные инсайты по вашим
          {"\n"}покупкам и питанию
        </Text>
      </Animated.View>

      <Animated.View style={cardStyles[1]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Общий анализ"
          onPress={() => handleActionPress("analysis")}
          style={({ pressed }) => [
            styles.heroCard,
            { borderColor: theme.primary, opacity: pressed ? 0.86 : 1 },
          ]}
        >
          <Image
            source={basket}
            style={styles.heroImage}
            resizeMode="contain"
          />
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>
              ГЛАВНОЕ
            </Text>
            <Text style={[styles.heroTitle, { color: theme.text }]}>
              Общий анализ
            </Text>
            <Text style={[styles.heroSubtitle, { color: theme.muted }]}>
              Посмотрим, как прошёл месяц
              {"\n"}и что можно улучшить.
            </Text>
          </View>
          <MaterialIcons name="arrow-forward" size={28} color={theme.primary} />
        </Pressable>
      </Animated.View>

      <Animated.View style={[cardStyles[2], { marginTop: 22 }]}>
        <View style={styles.actionList}>
          {actions.map((action) => (
            <ActionRow
              key={action.title}
              action={action}
              textColor={theme.text}
              mutedColor={theme.muted}
              borderColor={theme.border}
              onPress={() => handleActionPress(action.action)}
            />
          ))}
        </View>
      </Animated.View>

      <Animated.View style={cardStyles[3]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            showMoreActions ? "Скрыть ещё" : "Ещё AI-действия"
          }
          onPress={() => setShowMoreActions((visible) => !visible)}
          style={styles.moreButton}
        >
          <Text style={[styles.moreButtonText, { color: theme.primary }]}>
            {showMoreActions ? "Скрыть" : "Ещё AI-действия"}
          </Text>
          <MaterialIcons
            name={showMoreActions ? "expand-less" : "expand-more"}
            size={22}
            color={theme.primary}
          />
        </Pressable>
      </Animated.View>

      {showMoreActions && (
        <View style={styles.extraActions}>
          {extraActions.map((action) => (
            <ActionRow
              key={action.title}
              action={action}
              textColor={theme.text}
              mutedColor={theme.muted}
              borderColor={theme.border}
              onPress={() => handleActionPress(action.action)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Задать вопрос"
            onPress={() => navigation.navigate("Ask")}
            style={[styles.askRow, { borderBottomColor: theme.border }]}
          >
            <View
              style={[
                styles.actionIcon,
                { backgroundColor: theme.primary + "18" },
              ]}
            >
              <MaterialIcons name="chat" size={24} color={theme.primary} />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>
                Задать вопрос
              </Text>
              <Text style={[styles.actionSubtitle, { color: theme.muted }]}>
                Спросите AI о своих покупках
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={26} color={theme.muted} />
          </Pressable>
        </View>
      )}

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

      <AuthSheet
        visible={showAuthSheet}
        onClose={() => setShowAuthSheet(false)}
        onLogin={() => {
          setShowAuthSheet(false);
          navigation.navigate("Login");
        }}
        theme={theme}
      />
    </ScrollView>
  );
}

function ActionRow({
  action,
  textColor,
  mutedColor,
  borderColor,
  onPress,
}: {
  action: AssistantAction;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        { borderBottomColor: borderColor, opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <View
        style={[styles.actionIcon, { backgroundColor: action.color + "20" }]}
      >
        <MaterialIcons name={action.icon} size={25} color={action.color} />
      </View>
      <View style={styles.actionText}>
        <Text style={[styles.actionTitle, { color: textColor }]}>
          {action.title}
        </Text>
        <Text style={[styles.actionSubtitle, { color: mutedColor }]}>
          {action.subtitle}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={26} color={mutedColor} />
    </Pressable>
  );
}

function AuthSheet({
  visible,
  onClose,
  onLogin,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  onLogin: () => void;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <FullModalWindow
      visible={visible}
      setVisible={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable
          accessibilityLabel="Закрыть"
          style={styles.sheetBackdrop}
          onPress={onClose}
        />
        <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
          <View
            style={[styles.sheetHandle, { backgroundColor: theme.outline }]}
          />
          <View style={[styles.lockIcon, { borderColor: theme.primary }]}>
            <MaterialIcons
              name="lock-outline"
              size={25}
              color={theme.primary}
            />
          </View>
          <Text
            accessibilityLabel="AI доступен после входа"
            style={[styles.sheetTitle, { color: theme.text }]}
          >
            AI доступен после входа
          </Text>
          <Text style={[styles.sheetCopy, { color: theme.muted }]}>
            Войдите в аккаунт, чтобы получить персональные
            {"\n"}инсайты на основе ваших чеков.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Войти"
            onPress={onLogin}
            style={({ pressed }) => [
              styles.sheetLogin,
              { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.sheetLoginText, { color: theme.white }]}>
              Войти
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Продолжить без аккаунта"
            onPress={onClose}
            style={styles.sheetGuest}
          >
            <Text style={[styles.sheetGuestText, { color: theme.text }]}>
              Продолжить без аккаунта
            </Text>
          </Pressable>
        </View>
      </View>
    </FullModalWindow>
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
    paddingHorizontal: 21,
    paddingTop: 28,
    paddingBottom: 112,
  },
  brand: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  title: {
    fontFamily: "Georgia",
    fontSize: 46,
    fontWeight: "400",
    letterSpacing: -1.5,
    marginTop: 17,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 27,
    marginTop: 7,
  },
  heroCard: {
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 318,
    overflow: "hidden",
    paddingBottom: 16,
    paddingHorizontal: 22,
    paddingTop: 0,
  },
  heroImage: {
    alignSelf: "center",
    height: 185,
    marginTop: -3,
    width: "90%",
  },
  heroCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 1.3,
    marginBottom: 12,
    marginTop: 1,
  },
  heroTitle: {
    fontFamily: "Georgia",
    fontSize: 34,
    fontWeight: "400",
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 7,
  },
  actionList: {
    marginTop: 0,
  },
  actionRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 76,
    paddingVertical: 11,
  },
  askRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 76,
    paddingVertical: 11,
  },
  actionIcon: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    marginRight: 16,
    width: 44,
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: "500",
    lineHeight: 23,
  },
  actionSubtitle: {
    fontSize: 14,
    lineHeight: 19,
    marginTop: 2,
  },
  moreButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 52,
  },
  moreButtonText: {
    fontSize: 15,
    fontWeight: "600",
    marginRight: 5,
  },
  extraActions: {
    marginTop: -1,
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
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    backgroundColor: "rgba(22, 20, 17, 0.36)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  sheet: {
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    minHeight: 336,
    paddingBottom: 25,
    paddingHorizontal: 30,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: "center",
    borderRadius: 3,
    height: 5,
    marginBottom: 17,
    width: 42,
  },
  lockIcon: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 25,
    borderWidth: 1.5,
    height: 50,
    justifyContent: "center",
    marginBottom: 15,
    width: 50,
  },
  sheetTitle: {
    fontFamily: "Georgia",
    fontSize: 28,
    fontWeight: "400",
    textAlign: "center",
  },
  sheetCopy: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 7,
    textAlign: "center",
  },
  sheetLogin: {
    alignItems: "center",
    borderRadius: 9,
    height: 51,
    justifyContent: "center",
    marginTop: 20,
  },
  sheetLoginText: {
    fontSize: 18,
    fontWeight: "600",
  },
  sheetGuest: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  sheetGuestText: {
    fontSize: 16,
  },
});
