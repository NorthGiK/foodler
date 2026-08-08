import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { NavigationBar } from "expo-navigation-bar";
import type { SQLiteDatabase } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { initAiReportsTable } from "./src/ai/storage";
import { AuthProvider, useAuth } from "./src/api/auth";
import {
  pullServerReceipts,
  syncAiReports,
  syncAllLocalReceiptsBulk,
  syncPendingReceiptDeletions,
} from "./src/api/sync";
import { ThemeProvider, useTheme } from "./src/components/ThemeContext";
import { AnimatedPressable } from "./src/components/animations/AnimatedPressable";
import { springSnappy } from "./src/components/animations/animations";
import { AssistantScreen } from "./src/screens/AssistantScreen";
import { AskScreen } from "./src/screens/AskScreen";
import { ForgotPasswordScreen } from "./src/screens/ForgotPasswordScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { NewReceiptScreen } from "./src/screens/NewReceiptScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { ReceiptDetailScreen } from "./src/screens/ReceiptDetailScreen";
import { ReceiptsScreen } from "./src/screens/ReceiptsScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { StatsScreen } from "./src/screens/StatsScreen";
import { SubscriptionScreen } from "./src/screens/SubscriptionScreen";
import { TypesScreen } from "./src/screens/TypesScreen";
import {
  batchReceiptChanges,
  loadJoinedItems,
  loadReceipts,
  openDb,
  saveReceipt,
  subscribeToReceiptChanges,
} from "./src/storage";
import type { Receipt, ReceiptItem } from "./src/types";

type Tab = "scan" | "stats" | "types" | "receipts" | "profile" | "assistant";
type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

export type RootStackParamList = {
  Main: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  ReceiptDetail: { receipt: Receipt };
  NewReceipt: undefined;
  Ask: undefined;
  Subscription: undefined;
};

const TABS: { key: Tab; icon: MaterialIconName }[] = [
  { key: "scan", icon: "camera-alt" },
  { key: "stats", icon: "bar-chart" },
  { key: "types", icon: "category" },
  { key: "receipts", icon: "receipt-long" },
  { key: "profile", icon: "person" },
  { key: "assistant", icon: "smart-toy" },
];

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TAB_BAR_HORIZONTAL_PADDING = 12;
const TAB_BAR_GAP = 2;
const TAB_ITEM_WIDTH =
  (SCREEN_WIDTH - TAB_BAR_HORIZONTAL_PADDING * 2 - TAB_BAR_GAP * 5) /
  TABS.length;

const POLICIES_ACCEPTED_KEY = "@policies_accepted";

function TabContent() {
  const { theme, themeName } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("scan");
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [joined, setJoined] = useState<
    (ReceiptItem & { ticketDate?: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const refreshSequence = useRef(0);
  const contentProgress = useRef(new Animated.Value(1)).current;
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const tabBarOpacity = useRef(new Animated.Value(0)).current;

  const refresh = useCallback(async (database: SQLiteDatabase) => {
    const sequence = ++refreshSequence.current;
    try {
      const [nextReceipts, nextJoined] = await Promise.all([
        loadReceipts(database),
        loadJoinedItems(database),
      ]);
      if (sequence !== refreshSequence.current) return;
      setReceipts(nextReceipts);
      setJoined(nextJoined);
      setLoadError(null);
    } catch {
      if (sequence !== refreshSequence.current) return;
      setLoadError("Не удалось загрузить локальные данные");
    }
  }, []);

  const initializeStorage = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const database = await openDb();
      setDb(database);
      await refresh(database);
    } catch {
      setLoadError("Не удалось открыть локальное хранилище");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void NavigationBar.setHidden(true);
    void initializeStorage();
  }, [initializeStorage]);

  useEffect(() => {
    Animated.spring(tabBarOpacity, {
      toValue: 1,
      ...springSnappy,
      delay: 300,
    }).start();
  }, [tabBarOpacity]);

  useEffect(() => {
    contentProgress.setValue(0);
    Animated.timing(contentProgress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [contentProgress, tab]);

  useEffect(() => {
    if (!db) return;
    return subscribeToReceiptChanges(() => {
      void refresh(db);
    });
  }, [db, refresh]);

  useEffect(() => {
    if (!isAuthenticated || !db) return;
    let synchronizing = false;
    let syncQueued = false;

    const pushLocalReceipts = async () => {
      if (synchronizing) {
        syncQueued = true;
        return;
      }
      synchronizing = true;
      try {
        await syncAllLocalReceiptsBulk(db);
      } finally {
        synchronizing = false;
        if (syncQueued) {
          syncQueued = false;
          void pushLocalReceipts();
        }
      }
    };

    void (async () => {
      try {
        await syncPendingReceiptDeletions();
        await pushLocalReceipts();
        const serverData = await pullServerReceipts(db);
        if (serverData.receipts.length > 0) {
          await batchReceiptChanges(async () => {
            for (const receipt of serverData.receipts) {
              const items = serverData.items.filter(
                (item) => item.receiptId === receipt.id,
              );
              await saveReceipt(db, receipt, items);
            }
          });
        }
        await initAiReportsTable(db);
        await syncAiReports(db);
      } catch {
        // Local receipts remain available when background sync is unavailable.
        console.warn("Background synchronization failed");
      }
    })();

    return subscribeToReceiptChanges(() => {
      void pushLocalReceipts();
    });
  }, [isAuthenticated, db]);

  const switchTab = (newTab: Tab) => {
    if (newTab === tab) return;
    const tabIndex = TABS.findIndex((t) => t.key === newTab);
    // Add 6 to account for the left: 6 in indicator style
    Animated.spring(indicatorPosition, {
      toValue: tabIndex * TAB_ITEM_WIDTH,
      ...springSnappy,
    }).start();

    setTab(newTab);
    if ((newTab === "stats" || newTab === "types") && db) {
      refresh(db);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (!db) {
    return (
      <SafeAreaView
        style={[
          styles.center,
          styles.storageError,
          { backgroundColor: theme.bg },
        ]}
      >
        <Text style={[styles.storageErrorTitle, { color: theme.text }]}>
          Локальные данные недоступны
        </Text>
        <Text style={[styles.storageErrorText, { color: theme.muted }]}>
          {loadError ?? "Не удалось открыть локальное хранилище"}
        </Text>
        <AnimatedPressable onPress={() => void initializeStorage()}>
          <View
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.retryButtonText, { color: theme.white }]}>
              Повторить
            </Text>
          </View>
        </AnimatedPressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="auto" />
      <Animated.View
        style={[
          styles.body,
          {
            opacity: contentProgress,
            transform: [
              {
                translateY: contentProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [6, 0],
                }),
              },
            ],
          },
        ]}
      >
        {loadError && (
          <View
            style={[
              styles.refreshError,
              {
                backgroundColor: theme.surface,
                borderColor: theme.error,
              },
            ]}
          >
            <Text style={[styles.refreshErrorText, { color: theme.text }]}>
              Не удалось обновить локальные данные.
            </Text>
            <AnimatedPressable onPress={() => void refresh(db)}>
              <Text style={[styles.refreshRetryText, { color: theme.primary }]}>
                Повторить
              </Text>
            </AnimatedPressable>
          </View>
        )}
        {tab === "scan" && <ScanScreen db={db} switchTab={switchTab} />}
        {tab === "stats" && (
          <StatsScreen
            key={receipts.length + joined.length}
            receipts={receipts}
            joinedItems={joined}
            onRefresh={() => refresh(db)}
          />
        )}
        {tab === "types" && (
          <TypesScreen
            key={receipts.length + joined.length}
            receipts={receipts}
            joinedItems={joined}
            onRefresh={() => refresh(db)}
          />
        )}
        {tab === "receipts" && (
          <ReceiptsScreen
            receipts={receipts}
            onRefresh={() => refresh(db)}
            onOpenReceiptDetail={(receipt) =>
              navigation.navigate("ReceiptDetail", { receipt })
            }
            onNewReceipt={() => navigation.navigate("NewReceipt")}
          />
        )}
        {tab === "profile" && <ProfileScreen />}
        {tab === "assistant" && (
          <AssistantScreen db={db} receipts={receipts} joinedItems={joined} />
        )}
      </Animated.View>

      {/* Bottom overlay for content behind tab bar - darkens in dark mode, lightens in light */}
      <Animated.View
        style={[styles.bottomOverlay, { opacity: tabBarOpacity }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[
            theme.primary + "00",
            theme.primary + (themeName === "dark" ? "30" : "15"),
            theme.white + "5f",
          ]}
          style={styles.bottomOverlayGradient}
          dither={false}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      </Animated.View>

      {/* Floating pill-style tab bar */}
      <Animated.View
        style={[styles.tabBarContainer, { opacity: tabBarOpacity }]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.tabBar,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.indicator,
              {
                backgroundColor: theme.primary + "20",
                transform: [{ translateX: indicatorPosition }],
              },
            ]}
          />
          {TABS.map((t) => {
            const isActive = tab === t.key;
            return (
              <AnimatedPressable
                key={t.key}
                scaleTo={0.85}
                onPress={() => {
                  switchTab(t.key);
                }}
                style={styles.tabItem}
              >
                <View style={[styles.tabItemInner]}>
                  <MaterialIcons
                    name={t.icon}
                    size={22}
                    color={isActive ? theme.primary : theme.muted}
                    style={isActive ? styles.activeIcon : undefined}
                  />
                  {isActive && (
                    <View
                      style={[
                        styles.activeDot,
                        { backgroundColor: theme.primary },
                      ]}
                    />
                  )}
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [policiesAccepted, setPoliciesAccepted] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      try {
        const val = await AsyncStorage.getItem(POLICIES_ACCEPTED_KEY);
        setPoliciesAccepted(val === "true");
      } catch {
        setPoliciesAccepted(false);
      }
    })();
  }, []);

  const handlePoliciesAccepted = () => {
    setPoliciesAccepted(true);
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                  headerShown: false,
                  animation: "slide_from_bottom",
                  contentStyle: { backgroundColor: "transparent" },
                }}
              >
            
            {/* TODO: change to false */}
            <Stack.Screen
              name="__PoliciesAcception__"
              component={policiesAccepted? TabContent : () =>
                  <LoginScreen
                    skipable={true}
                    onPoliciesAccepted={handlePoliciesAccepted}
                  />
                }
              />
                <Stack.Screen name="Main" component={TabContent} />
                <Stack.Screen
                  name="Login"
                  component={LoginScreen}
                  options={{ animation: "slide_from_bottom" }}
                />
                <Stack.Screen
                  name="ForgotPassword"
                  component={ForgotPasswordScreen}
                  options={{ animation: "slide_from_bottom" }}
                />
                <Stack.Screen
                  name="ReceiptDetail"
                  component={ReceiptDetailScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <Stack.Screen
                  name="NewReceipt"
                  component={NewReceiptScreen}
                  options={{ animation: "slide_from_bottom" }}
                />
                <Stack.Screen
                  name="Ask"
                  component={AskScreen}
                  options={{ animation: "slide_from_right" }}
                />
                <Stack.Screen
                  name="Subscription"
                  component={SubscriptionScreen}
                  options={{ animation: "slide_from_right" }}
                />
            </Stack.Navigator>
          </NavigationContainer>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  storageError: { paddingHorizontal: 32 },
  storageErrorTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  storageErrorText: { fontSize: 14, marginTop: 8, textAlign: "center" },
  retryButton: {
    borderRadius: 14,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: { fontSize: 15, fontWeight: "700" },
  body: { flex: 1 },
  refreshError: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  refreshErrorText: { flex: 1, fontSize: 13 },
  refreshRetryText: { fontSize: 13, fontWeight: "700", marginLeft: 12 },
  bottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  bottomOverlayGradient: {
    flex: 1,
  },
  tabBarContainer: {
    position: "absolute",
    bottom: 8,
    left: TAB_BAR_HORIZONTAL_PADDING,
    right: TAB_BAR_HORIZONTAL_PADDING,
    alignItems: "center",
  },
  tabBarGlowContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  tabBarGlow: {
    width: SCREEN_WIDTH,
    height: 80,
    borderRadius: 100,
    opacity: 0.2,
  },
  tabBar: {
    flexDirection: "row",
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 1,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    position: "relative",
  },
  indicator: {
    position: "absolute",
    width: TAB_ITEM_WIDTH,
    height: "100%",
    borderRadius: 28,
    top: 7,
    left: 1,
  },
  tabItem: {
    width: TAB_ITEM_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    zIndex: 1,
  },
  tabItemInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  activeIcon: {
    marginTop: -2,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
});
