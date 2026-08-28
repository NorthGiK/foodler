import { AppState, type AppStateStatus } from "react-native";

import type { AnalyticsIdentityMode } from "@/api/generated/types.gen";
import {
  analytics,
  type AnalyticsService,
  type TelemetryEvent,
} from "./service";

export class AnalyticsTriggers {
  private appState: AppStateStatus = AppState.currentState;
  private subscription: { remove(): void } | null = null;
  constructor(private readonly service: AnalyticsService) {}
  start(): void {
    if (this.subscription) return;
    this.subscription = AppState.addEventListener("change", (next) => {
      const background = this.appState === "active" && next !== "active";
      this.appState = next;
      if (background) void this.service.logEvent({ name: "app_backgrounded" });
      if (next === "active") void this.service.retryPending();
    });
  }
  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }
  resolvedAuth(mode?: AnalyticsIdentityMode): Promise<void> {
    return this.service.resolvedAuth(mode);
  }
  resolvedConsent(consent: boolean): Promise<void> {
    return this.service.resolveConsent(consent);
  }
  enqueueAndMaybeFlush(event: TelemetryEvent): Promise<void> {
    return this.service.logEvent(event);
  }
  flush(): Promise<void> {
    return this.service.retryPending();
  }
}
export const analyticsTriggers = new AnalyticsTriggers(analytics);
