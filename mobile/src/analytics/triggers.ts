import { AppState, type AppStateStatus } from "react-native";

import { analytics, type AnalyticsService } from "./service";

export class AnalyticsTriggers {
  private appState: AppStateStatus = AppState.currentState;
  private subscription: { remove(): void } | null = null;
  constructor(private readonly service: AnalyticsService = analytics) {}
  start(): void {
    if (this.subscription) return;
    this.subscription = AppState.addEventListener("change", (next) => {
      const foreground = this.appState !== "active" && next === "active";
      this.appState = next;
      if (foreground) void this.service.retryPending();
    });
  }
  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }
  async resolvedAuth(
    enabled?: boolean,
    externalId: string | null = null,
  ): Promise<void> {
    if (enabled === undefined) await this.service.clearAccount();
    else await this.service.applyAccountPreference(enabled, externalId);
    await this.service.retryPending();
  }
  async resolvedConsent(consent: boolean): Promise<void> {
    await this.service.resolveConsent(consent);
  }
  async enqueueAndMaybeFlush(event: {
    eventName: string;
    properties: Record<string, unknown>;
    occurredAt?: string;
  }): Promise<void> {
    await this.service.track(event.eventName, event.properties);
  }
}

export const analyticsTriggers = new AnalyticsTriggers();
