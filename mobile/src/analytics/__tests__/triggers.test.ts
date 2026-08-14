import { AppState, type AppStateStatus } from "react-native";

import type { AnalyticsService } from "../service";
import {
  AnalyticsTriggers,
  normalizeAnalyticsLocale,
  type AnalyticsDimensions,
} from "../triggers";

const dimensions: AnalyticsDimensions = {
  platform: "android",
  appVersion: "2.0.4",
  appBuild: "4",
  osVersion: "14",
  locale: "ru-RU",
  timezone: "Asia/Yekaterinburg",
};

function serviceDouble(queueLength = 0) {
  return {
    applyAccountPreference: jest.fn().mockResolvedValue(undefined),
    enqueue: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
    queueLength: jest.fn().mockResolvedValue(queueLength),
    resolveConsent: jest.fn().mockResolvedValue(undefined),
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

describe("AnalyticsTriggers", () => {
  afterEach(() => jest.restoreAllMocks());

  it("normalizes script locales to the backend allowlisted language/region", () => {
    expect(normalizeAnalyticsLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeAnalyticsLocale("pt_BR")).toBe("pt-BR");
    expect(normalizeAnalyticsLocale("invalid-value-123")).toBe("en-US");
  });

  it("flushes on foreground and removes the AppState subscription", async () => {
    const service = serviceDouble();
    let listener: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, callback) => {
        listener = callback;
        return { remove };
      });
    const triggers = new AnalyticsTriggers(
      service as unknown as AnalyticsService,
      () => dimensions,
    );

    triggers.start();
    listener?.("active");
    listener?.("background");
    listener?.("active");
    await settle();
    expect(service.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "app_backgrounded",
        properties: {},
      }),
    );
    expect(service.flush).toHaveBeenCalledWith(dimensions);
    triggers.stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("flushes when the queue reaches the batch threshold", async () => {
    const service = serviceDouble(50);
    const triggers = new AnalyticsTriggers(
      service as unknown as AnalyticsService,
      () => dimensions,
    );
    const analyticsEvent = {
      eventName: "app_opened" as const,
      occurredAt: new Date().toISOString(),
      properties: {},
    };

    await triggers.enqueueAndMaybeFlush(analyticsEvent);
    expect(service.enqueue).toHaveBeenCalledWith(analyticsEvent);
    expect(service.flush).toHaveBeenCalledWith(dimensions);
  });

  it("applies resolved auth before flushing and flushes guest resolution", async () => {
    const service = serviceDouble();
    const triggers = new AnalyticsTriggers(
      service as unknown as AnalyticsService,
      () => dimensions,
    );

    await triggers.resolvedAuth(false);
    expect(service.applyAccountPreference).toHaveBeenCalledWith(false);
    expect(service.flush).toHaveBeenCalledTimes(1);
    await triggers.resolvedAuth();
    expect(service.applyAccountPreference).toHaveBeenCalledTimes(1);
    expect(service.flush).toHaveBeenCalledTimes(2);
  });
});
