import MaterialIcons from "@react-native-vector-icons/material-icons";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { RootStackParamList } from "../../App";
import { analyticsEvents, type AnalyticsTab } from "../analytics/facade";
import { useTheme } from "../components/ThemeContext";
import { AppDataProvider, useAppData } from "../features/app/AppDataContext";
import { AssistantScreen } from "../screens/AssistantScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReceiptsScreen } from "../screens/ReceiptsScreen";
import { StatsScreen } from "../screens/StatsScreen";
import { MAIN_TABS, type MainTabParamList } from "./mainTabsConfig";
import { useQrRequest } from "./qrRequest";

export { MAIN_TABS, type MainTabParamList } from "./mainTabsConfig";
const Tab = createBottomTabNavigator<MainTabParamList>();

function ReceiptsTab({ scanRequestId }: { scanRequestId: number }) {
  const { db, receipts, joinedItems, storeAliases, refresh } = useAppData();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <ReceiptsScreen
      db={db}
      receipts={receipts}
      joinedItems={joinedItems}
      onRefresh={refresh}
      onOpenReceiptDetail={(receipt) =>
        navigation.navigate("ReceiptDetail", { receipt, storeAliases })
      }
      storeAliases={storeAliases}
      scanRequestId={scanRequestId}
    />
  );
}
function StatsTab() {
  const { receipts, joinedItems } = useAppData();
  return (
    <StatsScreen
      receipts={receipts}
      joinedItems={joinedItems}
    />
  );
}
function AssistantTab() {
  const { db, receipts, joinedItems } = useAppData();
  return (
    <AssistantScreen db={db} receipts={receipts} joinedItems={joinedItems} />
  );
}
function ProfileTab() {
  const {
    receipts,
    storeAliases,
    saveLocalStoreAlias,
    restoreLocalStoreAlias,
  } = useAppData();
  return (
    <ProfileScreen
      stores={receipts.map((receipt) => receipt.organization)}
      storeAliases={storeAliases}
      onSaveStoreAlias={saveLocalStoreAlias}
      onRestoreStoreAlias={restoreLocalStoreAlias}
    />
  );
}

function MainTabsNavigator({ scanRequestId }: { scanRequestId: number }) {
  const { theme } = useTheme();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  useEffect(() => {
    if (scanRequestId > 0) navigation.navigate("Receipts");
  }, [navigation, scanRequestId]);
  return (
    <Tab.Navigator
      initialRouteName="Receipts"
      screenListeners={({ route }) => ({
        focus: () => {
          void analyticsEvents.tabViewed(route.name as AnalyticsTab);
        },
      })}
      screenOptions={({ route }) => {
        const tab = MAIN_TABS.find((item) => item.name === route.name);
        return {
          headerShown: false,
          animation: "fade",
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            paddingBottom: 8,
          },
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons
              name={tab?.icon ?? "receipt-long"}
              color={color}
              size={size}
            />
          ),
        };
      }}
    >
      <Tab.Screen name="Receipts" options={{ title: "Чеки" }}>
        {() => <ReceiptsTab scanRequestId={scanRequestId} />}
      </Tab.Screen>
      <Tab.Screen
        name="Stats"
        component={StatsTab}
        options={{ title: "Статистика" }}
      />
      <Tab.Screen
        name="Assistant"
        component={AssistantTab}
        options={{ title: "AI" }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileTab}
        options={{ title: "Профиль" }}
      />
    </Tab.Navigator>
  );
}

function MainTabsContent() {
  const { theme } = useTheme();
  const { db, loading, loadError, initializeStorage } = useAppData();
  const { requestId: scanRequestId } = useQrRequest();
  if (loading)
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  if (!db)
    return (
      <View
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
        <Pressable onPress={() => void initializeStorage()}>
          <View
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.retryButtonText, { color: theme.white }]}>
              Повторить
            </Text>
          </View>
        </Pressable>
      </View>
    );
  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {loadError && (
        <View
          style={[
            styles.refreshError,
            { backgroundColor: theme.surface, borderColor: theme.error },
          ]}
        >
          <Text style={[styles.refreshErrorText, { color: theme.text }]}>
            Не удалось обновить локальные данные.
          </Text>
          <Pressable onPress={() => void initializeStorage()}>
            <Text style={[styles.refreshRetryText, { color: theme.primary }]}>
              Повторить
            </Text>
          </Pressable>
        </View>
      )}
      <MainTabsNavigator scanRequestId={scanRequestId} />
    </View>
  );
}

export function MainTabs() {
  return (
    <AppDataProvider>
      <StatusBar
        style="auto"
        animated={true}
        hideTransitionAnimation={"fade"}
      />
      <MainTabsContent />
    </AppDataProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
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
  tabLabel: { fontSize: 12, fontWeight: "600" },
});
