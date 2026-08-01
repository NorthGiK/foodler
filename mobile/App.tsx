import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { TamaguiProvider } from "tamagui";
import { initAiReportsTable } from "./src/ai/storage";
import { AuthProvider, useAuth } from "./src/api/auth";
import {
  pullServerReceipts,
  syncAiReports,
  syncAllLocalReceiptsBulk,
} from "./src/api/sync";
import { ThemeProvider, useTheme } from "./src/components/ThemeContext";
import { AnimatedPressable } from "./src/components/animations/AnimatedPressable";
import { springSnappy } from "./src/components/animations/animations";
import { AssistantScreen } from "./src/screens/AssistantScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { ReceiptsScreen } from "./src/screens/ReceiptsScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { StatsScreen } from "./src/screens/StatsScreen";
import { TypesScreen } from "./src/screens/TypesScreen";
import {
  loadJoinedItems,
  loadReceipts,
  openDb,
  saveReceipt,
} from "./src/storage";
import type { Receipt, ReceiptItem } from "./src/types";
import tamaguiConfig from "./tamagui.config";

type Tab = "scan" | "stats" | "types" | "receipts" | "profile" | "assistant";

export type RootStackParamList = {
  Main: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  ReceiptDetail: { receipt: Receipt };
  NewReceipt: undefined;
  Ask: undefined;
};

const TABS: Array<{ key: Tab; icon: string }> = [
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
  const [db, setDb] = useState<any>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [joined, setJoined] = useState<
    (ReceiptItem & { ticketDate?: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const tabAnim = useRef(new Animated.Value(0)).current;
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const tabBarOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    NavigationBar.setHidden(true);
    let active = true;
    (async () => {
      try {
        const d = await openDb();
        if (!active) return;
        setDb(d);
        await refresh(d);
      } catch (e) {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    Animated.spring(tabBarOpacity, {
      toValue: 1,
      ...springSnappy,
      delay: 300,
    }).start();
  }, []);

  const refresh = async (d = db) => {
    if (!d) return;
    const [r, j] = await Promise.all([loadReceipts(d), loadJoinedItems(d)]);
    setReceipts(r);
    setJoined(j);
  };

  // Delete @synced_receipt_ids key so bulk sync re-syncs everything after login
  const clearSyncedIds = async () => {
    try {
      await AsyncStorage.removeItem("@synced_receipt_ids");
    } catch {}
  };

  useEffect(() => {
    if (!isAuthenticated || !db) return;
    (async () => {
      await clearSyncedIds();
      await syncAllLocalReceiptsBulk(db);
      const serverData = await pullServerReceipts(db);
      if (serverData.receipts.length > 0) {
        for (let i = 0; i < serverData.receipts.length; i++) {
          const receipt = serverData.receipts[i];
          const items = serverData.items.filter(
            (it) => it.receiptId === receipt.id,
          );
          await saveReceipt(db, receipt, items);
        }
        await refresh(db);
      }
      // Initialize AI reports table before syncing
      try {
        await initAiReportsTable(db);
      } catch (e) {
        console.warn("Failed to init AI reports table", e);
      }
      await syncAiReports(db);
    })();
  }, [isAuthenticated, db]);

  const switchTab = (newTab: Tab) => {
    const tabIndex = TABS.findIndex((t) => t.key === newTab);
    // Add 6 to account for the left: 6 in indicator style
    Animated.spring(indicatorPosition, {
      toValue: tabIndex * TAB_ITEM_WIDTH,
      ...springSnappy,
    }).start();

    tabAnim.setValue(0);
    Animated.timing(tabAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="auto" />
      <View style={styles.body}>
        {tab === "scan" && (
          <ScanScreen
            db={db}
            onReceiptSaved={refresh}
            switchTab={(t: string) => setTab(t as Tab)}
          />
        )}
        {tab === "stats" && (
          <StatsScreen
            key={receipts.length + joined.length}
            receipts={receipts}
            joinedItems={joined}
            onRefresh={refresh}
          />
        )}
        {tab === "types" && (
          <TypesScreen
            key={receipts.length + joined.length}
            receipts={receipts}
            joinedItems={joined}
            onRefresh={refresh}
          />
        )}
        {tab === "receipts" && (
          <ReceiptsScreen
            db={db}
            receipts={receipts}
            onSaved={refresh}
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
      </View>

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
                    name={t.icon as any}
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
  const [policiesAccepted, setPoliciesAccepted] = useState<boolean | null>(null);

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
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <NavigationContainer>
              {policiesAccepted === false ? (
                <LoginScreen
                  skipable={true}
                  onPoliciesAccepted={handlePoliciesAccepted}
                />
              ) : (
                <Stack.Navigator
                  screenOptions={{
                    headerShown: false,
                    animation: "slide_from_bottom",
                    contentStyle: { backgroundColor: "transparent" },
                  }}
                >
                  <Stack.Screen name="Main" component={TabContent} />
                  <Stack.Screen
                    name="Login"
                    getComponent={() =>
                      require("./src/screens/LoginScreen").LoginScreen
                    }
                    options={{ animation: "slide_from_bottom" }}
                  />
                  <Stack.Screen
                    name="ForgotPassword"
                    getComponent={() =>
                      require("./src/screens/ForgotPasswordScreen")
                        .ForgotPasswordScreen
                    }
                    options={{ animation: "slide_from_bottom" }}
                  />
                  <Stack.Screen
                    name="ReceiptDetail"
                    getComponent={() =>
                      require("./src/screens/ReceiptDetailScreen")
                        .ReceiptDetailScreen
                    }
                    options={{ animation: "slide_from_right" }}
                  />
                  <Stack.Screen
                    name="NewReceipt"
                    getComponent={() =>
                      require("./src/screens/NewReceiptScreen").NewReceiptScreen
                    }
                    options={{ animation: "slide_from_bottom" }}
                  />
                  <Stack.Screen
                    name="Ask"
                    getComponent={() =>
                      require("./src/screens/AskScreen").AskScreen
                    }
                    options={{ animation: "slide_from_right" }}
                  />
                </Stack.Navigator>
              )}
            </NavigationContainer>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  body: { flex: 1 },
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