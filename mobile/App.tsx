import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NavigationBar } from "expo-navigation-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { analyticsEvents } from "./src/analytics/facade";
import { analyticsTriggers } from "./src/analytics/triggers";
import { AuthProvider } from "./src/api/auth";
import { ThemeProvider, useTheme } from "./src/components/ThemeContext";
import { MainTabs } from "./src/navigation/MainTabs";
import { createNavigationTheme } from "./src/navigationTheme";
import { AskScreen } from "./src/screens/AskScreen";
import { ForgotPasswordScreen } from "./src/screens/ForgotPasswordScreen";
import { InitialEntryScreen } from "./src/screens/InitialEntryScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { NewReceiptScreen } from "./src/screens/NewReceiptScreen";
import { ReceiptDetailScreen } from "./src/screens/ReceiptDetailScreen";
import { SubscriptionScreen } from "./src/screens/SubscriptionScreen";
import type { StoreAliases } from "./src/storeAliases";
import type { Receipt } from "./src/types";

export type RootStackParamList = {
  __PoliciesAcception__: undefined;
  Main: undefined;
  Login: { initialEntry?: boolean } | undefined;
  ForgotPassword: undefined;
  ReceiptDetail: { receipt: Receipt; storeAliases: StoreAliases };
  NewReceipt: undefined;
  Ask: undefined;
  Subscription: undefined;
};
const Stack = createNativeStackNavigator<RootStackParamList>();
const POLICIES_ACCEPTED_KEY = "@policies_accepted";

function AppNavigator() {
  const { theme, themeName } = useTheme();
  const [policiesAccepted, setPoliciesAccepted] = useState<boolean | null>(
    null,
  );
  const openedTracked = useRef(false);
  const trackOpenedOnce = useCallback(() => {
    if (openedTracked.current) return;
    openedTracked.current = true;
    void analyticsEvents.appOpened();
  }, []);
  useEffect(() => {
    void NavigationBar.setHidden(true);
    analyticsTriggers.start();
    return () => analyticsTriggers.stop();
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        const accepted =
          (await AsyncStorage.getItem(POLICIES_ACCEPTED_KEY)) === "true";
        setPoliciesAccepted(accepted);
        await analyticsTriggers.resolvedConsent(accepted);
        if (accepted) trackOpenedOnce();
      } catch {
        setPoliciesAccepted(false);
        await analyticsTriggers.resolvedConsent(false);
      }
    })();
  }, [trackOpenedOnce]);
  const handlePoliciesAccepted = async () => {
    await analyticsTriggers.resolvedConsent(true);
    await Promise.all([
      analyticsEvents.policyAccepted("privacy", "1.1"),
      analyticsEvents.policyAccepted("terms", "1.1"),
    ]);
    trackOpenedOnce();
  };
  if (policiesAccepted === null) return null;
  return (
    <AuthProvider>
      <NavigationContainer theme={createNavigationTheme(theme, themeName)}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: "slide_from_bottom",
            contentStyle: { backgroundColor: theme.bg },
          }}
        >
          <Stack.Screen
            name="__PoliciesAcception__"
            component={
              policiesAccepted
                ? MainTabs
                : () => (
                    <InitialEntryScreen
                      onPoliciesAccepted={handlePoliciesAccepted}
                    />
                  )
            }
          />
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
          />
          <Stack.Screen
            name="ReceiptDetail"
            component={ReceiptDetailScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen name="NewReceipt" component={NewReceiptScreen} />
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
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
