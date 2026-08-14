import Constants from "expo-constants";
import { AppState, type AppStateStatus, Platform } from "react-native";

import type { AnalyticsEventsRequest } from "@/api/generated/types.gen";

import {
  ANALYTICS_FLUSH_THRESHOLD,
  analytics,
  type AnalyticsService,
} from "./service";

export type AnalyticsDimensions = Omit<
  AnalyticsEventsRequest,
  "installationId" | "events"
>;

export function normalizeAnalyticsLocale(raw: string | undefined): string {
  if (!raw) return "en-US";
  const [rawLanguage, ...rest] = raw.replaceAll("_", "-").split("-");
  if (!/^[A-Za-z]{2,3}$/.test(rawLanguage)) return "en-US";
  const language = rawLanguage.toLowerCase();
  const region = rest.find((part) => /^[A-Za-z]{2}$/.test(part));
  return region ? `${language}-${region.toUpperCase()}` : language;
}

function safeTimezone(raw: string | undefined): string {
  return raw &&
    /^(?:UTC|[A-Za-z0-9_.+-]+(?:\/[A-Za-z0-9_.+-]+){1,2})$/.test(raw)
    ? raw
    : "UTC";
}

export function safeDimensions(): AnalyticsDimensions {
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  const config = Constants.expoConfig;
  const appBuild =
    Platform.OS === "ios"
      ? config?.ios?.buildNumber
      : config?.android?.versionCode;
  return {
    platform: Platform.OS === "ios" ? "ios" : "android",
    appVersion: config?.version ?? "unknown",
    appBuild: String(appBuild ?? "unknown"),
    osVersion: String(Platform.Version),
    locale: normalizeAnalyticsLocale(resolved.locale),
    timezone: safeTimezone(resolved.timeZone),
  };
}

export class AnalyticsTriggers {
  private appState: AppStateStatus = AppState.currentState;
  private subscription: { remove(): void } | null = null;

  constructor(
    private readonly service: AnalyticsService,
    private readonly dimensions: () => AnalyticsDimensions = safeDimensions,
  ) {}

  start(): void {
    if (this.subscription) return;
    this.subscription = AppState.addEventListener("change", (next) => {
      const background = this.appState === "active" && next !== "active";
      const foreground = this.appState !== "active" && next === "active";
      this.appState = next;
      if (background) {
        void this.enqueueAndMaybeFlush({
          eventName: "app_backgrounded",
          occurredAt: new Date().toISOString(),
          properties: {},
        });
      }
      if (foreground) void this.flush();
    });
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }

  async resolvedAuth(accountEnabled?: boolean): Promise<void> {
    if (accountEnabled !== undefined) {
      await this.service.applyAccountPreference(accountEnabled);
    }
    await this.flush();
  }

  async resolvedConsent(consent: boolean): Promise<void> {
    await this.service.resolveConsent(consent);
    await this.flush();
  }

  async enqueueAndMaybeFlush(
    event: Parameters<AnalyticsService["enqueue"]>[0],
  ): Promise<void> {
    await this.service.enqueue(event);
    if ((await this.service.queueLength()) >= ANALYTICS_FLUSH_THRESHOLD) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    await this.service.flush(this.dimensions());
  }
}

export const analyticsTriggers = new AnalyticsTriggers(analytics);
