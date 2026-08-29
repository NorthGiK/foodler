import { NativeModules, Platform } from "react-native";

type MyTrackerNativeModule = {
  init(apiKey: string): Promise<void>;
  setCustomUserId(value: string): Promise<void>;
  trackEvent(name: string, properties: Record<string, string>): Promise<void>;
  flush(): Promise<void>;
};

const native = NativeModules.FoodlerMyTracker as
  MyTrackerNativeModule | undefined;
const apiKey = process.env.EXPO_PUBLIC_MYTRACKER_API_KEY;
let started = false;

function safeProperties(
  properties: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties).flatMap(([key, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? [[key, String(value)]]
        : [],
    ),
  );
}

export const myTracker = {
  async start(): Promise<void> {
    if (started || Platform.OS !== "android" || !native || !apiKey) return;
    await native.init(apiKey);
    started = true;
  },
  async stopIdentity(): Promise<void> {
    if (Platform.OS === "android" && native) await native.setCustomUserId("");
  },
  async setCustomUserId(value: string): Promise<void> {
    if (Platform.OS === "android" && native)
      await native.setCustomUserId(value);
  },
  async trackEvent(
    name: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    if (Platform.OS === "android" && native && apiKey)
      await native.trackEvent(name, safeProperties(properties));
  },
  async flush(): Promise<void> {
    if (Platform.OS === "android" && native && apiKey) await native.flush();
  },
};
