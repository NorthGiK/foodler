import AsyncStorage from "@react-native-async-storage/async-storage";
import * as analyticsSdk from "@react-native-firebase/analytics";
import * as crashlyticsSdk from "@react-native-firebase/crashlytics";

import { api, getDeviceId } from "@/api/client";
import type { AnalyticsIdentityMode } from "@/api/generated/types.gen";

const STATE_KEY = "@foodler_firebase_telemetry";
const LEGACY_KEYS = [
  "@foodler_analytics_installation",
  "@foodler_analytics_state",
  "@foodler_analytics_queue",
] as const;
export type AnalyticsPreferenceState = {
  consent: boolean;
  mode: AnalyticsIdentityMode;
  pendingMode: AnalyticsIdentityMode | null;
  accountMode: AnalyticsIdentityMode | null;
};
const DEFAULT_STATE: AnalyticsPreferenceState = {
  consent: false,
  mode: "anonymous",
  pendingMode: null,
  accountMode: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function parseState(raw: string | null): AnalyticsPreferenceState {
  if (!raw) return DEFAULT_STATE;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.consent !== "boolean")
      return DEFAULT_STATE;
    const oldEnabled =
      typeof value.enabled === "boolean" ? value.enabled : false;
    const mode: AnalyticsIdentityMode =
      value.mode === "identified" || value.mode === "anonymous"
        ? value.mode
        : oldEnabled
          ? "identified"
          : "anonymous";
    const pendingMode: AnalyticsIdentityMode | null =
      value.pendingMode === "identified" || value.pendingMode === "anonymous"
        ? value.pendingMode
        : typeof value.pendingPreference === "boolean"
          ? value.pendingPreference
            ? "identified"
            : "anonymous"
          : null;
    const accountMode: AnalyticsIdentityMode | null =
      value.accountMode === "identified" || value.accountMode === "anonymous"
        ? value.accountMode
        : typeof value.accountEnabled === "boolean"
          ? value.accountEnabled
            ? "identified"
            : "anonymous"
          : null;
    return { consent: value.consent, mode, pendingMode, accountMode };
  } catch {
    return DEFAULT_STATE;
  }
}
export type TelemetryEvent = {
  name: string;
  params?: Record<string, string | number>;
};

export class AnalyticsService {
  private mutation: Promise<void> = Promise.resolve();
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutation.then(operation, operation);
    this.mutation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  private async readState(): Promise<AnalyticsPreferenceState> {
    return parseState(await AsyncStorage.getItem(STATE_KEY));
  }
  private async writeState(state: AnalyticsPreferenceState): Promise<void> {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  }
  private async migrateLegacy(): Promise<void> {
    if (!(await AsyncStorage.getItem(STATE_KEY)))
      await this.writeState(
        parseState(await AsyncStorage.getItem(LEGACY_KEYS[1])),
      );
    await AsyncStorage.multiRemove([...LEGACY_KEYS]);
  }
  private async clearIdentity(resetAnalytics: boolean): Promise<void> {
    const analytics = analyticsSdk.getAnalytics();
    const crashlytics = crashlyticsSdk.getCrashlytics();
    await Promise.all([
      analyticsSdk.setUserId(analytics, null),
      analyticsSdk.setUserProperties(analytics, { foodler_device: null }),
      crashlyticsSdk.setUserId(crashlytics, ""),
      crashlyticsSdk.setAttribute(crashlytics, "foodler_device", ""),
    ]);
    if (resetAnalytics) await analyticsSdk.resetAnalyticsData(analytics);
  }
  private async applyIdentity(
    mode: AnalyticsIdentityMode,
    accountId: string | null | undefined,
    deviceId: string | null | undefined,
    reset = false,
  ): Promise<void> {
    if (mode !== "identified" || !accountId || !deviceId)
      return this.clearIdentity(reset);
    const analytics = analyticsSdk.getAnalytics();
    const crashlytics = crashlyticsSdk.getCrashlytics();
    await Promise.all([
      analyticsSdk.setUserId(analytics, accountId),
      analyticsSdk.setUserProperties(analytics, { foodler_device: deviceId }),
      crashlyticsSdk.setUserId(crashlytics, accountId),
      crashlyticsSdk.setAttribute(crashlytics, "foodler_device", deviceId),
    ]);
  }
  async preferenceState(): Promise<AnalyticsPreferenceState> {
    return this.run(async () => {
      await this.migrateLegacy();
      return this.readState();
    });
  }
  async resolveConsent(consent: boolean): Promise<void> {
    await this.run(async () => {
      await this.migrateLegacy();
      const state = await this.readState();
      await this.writeState({ ...state, consent });
      await Promise.all([
        analyticsSdk.setAnalyticsCollectionEnabled(
          analyticsSdk.getAnalytics(),
          consent,
        ),
        crashlyticsSdk.setCrashlyticsCollectionEnabled(
          crashlyticsSdk.getCrashlytics(),
          consent,
        ),
      ]);
      if (!consent) await this.clearIdentity(false);
    });
  }
  async resolvedAuth(accountMode?: AnalyticsIdentityMode): Promise<void> {
    await this.run(async () => {
      await this.migrateLegacy();
      const state = await this.readState();
      if (!state.consent || !accountMode) {
        await this.clearIdentity(false);
        return;
      }
      const activeMode = state.pendingMode ?? accountMode;
      await this.writeState({ ...state, mode: activeMode, accountMode });
      if (activeMode !== "identified") {
        await this.clearIdentity(false);
        return;
      }
      try {
        const identity = await api.resolveAnalyticsIdentity({
          deviceId: await getDeviceId(),
        });
        await this.writeState({
          ...state,
          mode: identity.mode,
          accountMode: identity.mode,
          pendingMode: null,
        });
        await this.applyIdentity(
          identity.mode,
          identity.accountAnalyticsId,
          identity.deviceAnalyticsId,
        );
      } catch {
        await this.clearIdentity(false);
      }
    });
  }
  async setPreference(
    mode: AnalyticsIdentityMode,
  ): Promise<"synced" | "pending"> {
    return this.run(async () => {
      await this.migrateLegacy();
      const state = await this.readState();
      if (mode === "anonymous") await this.clearIdentity(true);
      await this.writeState({ ...state, mode, pendingMode: mode });
      try {
        const identity = await api.setAnalyticsIdentityMode({ mode });
        await this.writeState({
          ...state,
          mode: identity.mode,
          accountMode: identity.mode,
          pendingMode: null,
        });
        await this.applyIdentity(
          identity.mode,
          identity.accountAnalyticsId,
          identity.deviceAnalyticsId,
          mode === "anonymous",
        );
        return "synced";
      } catch {
        return "pending";
      }
    });
  }
  async retryPending(): Promise<void> {
    const state = await this.preferenceState();
    if (state.pendingMode) await this.setPreference(state.pendingMode);
  }
  async logEvent(event: TelemetryEvent): Promise<void> {
    const state = await this.preferenceState();
    if (state.consent)
      analyticsSdk.logEvent(
        analyticsSdk.getAnalytics(),
        event.name,
        event.params,
      );
  }
  async recordError(
    error: unknown,
    context: {
      screen?: string;
      authState?: string;
      premiumState?: string;
      buildChannel?: string;
    },
  ): Promise<void> {
    const state = await this.preferenceState();
    if (!state.consent || !(error instanceof Error)) return;
    const message =
      error.name.replace(/[^A-Za-z0-9 _.-]/g, "").slice(0, 120) ||
      "Unexpected error";
    const crashlytics = crashlyticsSdk.getCrashlytics();
    await crashlyticsSdk.setAttributes(crashlytics, {
      screen: context.screen ?? "unknown",
      auth_state: context.authState ?? "unknown",
      premium_state: context.premiumState ?? "unknown",
      build_channel: context.buildChannel ?? "unknown",
    });
    crashlyticsSdk.recordError(crashlytics, new Error(message));
  }
}
export const analytics = new AnalyticsService();
