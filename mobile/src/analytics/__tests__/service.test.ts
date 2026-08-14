import AsyncStorage from "@react-native-async-storage/async-storage";

import { api } from "@/api/client";
import type {
  AnalyticsEventRequest,
  AnalyticsEventsRequest,
} from "@/api/generated/types.gen";

import { AnalyticsService } from "../service";

jest.mock("@/api/client", () => ({
  api: {
    ingestAnalyticsEvents: jest.fn(),
    setAnalyticsPreference: jest.fn(),
  },
}));

const dimensions: Omit<AnalyticsEventsRequest, "installationId" | "events"> = {
  platform: "android",
  appVersion: "2.0.4",
  appBuild: "4",
  osVersion: "14",
  locale: "ru-RU",
  timezone: "Asia/Yekaterinburg",
};

function event(
  index: number,
): Omit<AnalyticsEventRequest, "eventId" | "sessionId"> {
  return {
    eventName: "app_opened",
    occurredAt: new Date(1_700_000_000_000 + index).toISOString(),
    properties: {},
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

describe("AnalyticsService", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    jest.mocked(api.ingestAnalyticsEvents).mockResolvedValue({
      accepted: true,
      inserted: 1,
    });
    jest
      .mocked(api.setAnalyticsPreference)
      .mockResolvedValue({ enabled: true });
  });

  it("does not enqueue before consent and persists stable queued events", async () => {
    const first = new AnalyticsService();
    await first.enqueue(event(0));
    expect(await first.queueLength()).toBe(0);

    await first.resolveConsent(true);
    await first.enqueue(event(1));
    const stored = JSON.parse(
      (await AsyncStorage.getItem("@foodler_analytics_queue")) ?? "[]",
    ) as AnalyticsEventRequest[];
    expect(stored).toHaveLength(1);

    const restarted = new AnalyticsService();
    await restarted.flush(dimensions);
    expect(api.ingestAnalyticsEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [expect.objectContaining({ eventId: stored[0].eventId })],
      }),
    );
    expect(await restarted.queueLength()).toBe(0);
  });

  it("caps the FIFO queue at 500 by dropping the oldest event", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    for (let index = 0; index < 501; index += 1) {
      await service.enqueue(event(index));
    }

    const stored = JSON.parse(
      (await AsyncStorage.getItem("@foodler_analytics_queue")) ?? "[]",
    ) as AnalyticsEventRequest[];
    expect(stored).toHaveLength(500);
    expect(stored[0].occurredAt).toBe(event(1).occurredAt);
    expect(stored[499].occurredAt).toBe(event(500).occurredAt);
  });

  it("sends at most 50 FIFO events and preserves an enqueue during flight", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    for (let index = 0; index < 51; index += 1) {
      await service.enqueue(event(index));
    }

    let acknowledge:
      ((value: { accepted: boolean; inserted: number }) => void) | undefined;
    jest.mocked(api.ingestAnalyticsEvents).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const flushing = service.flush(dimensions);
    await settle();
    const duringFlight = service.enqueue(event(99));
    expect(api.ingestAnalyticsEvents).toHaveBeenCalledWith(
      expect.objectContaining({ events: expect.any(Array) }),
    );
    const sent = jest.mocked(api.ingestAnalyticsEvents).mock.calls[0][0].events;
    expect(sent).toHaveLength(50);
    expect(sent[0].occurredAt).toBe(event(0).occurredAt);
    acknowledge?.({ accepted: true, inserted: 50 });
    await flushing;
    await duringFlight;

    const remaining = JSON.parse(
      (await AsyncStorage.getItem("@foodler_analytics_queue")) ?? "[]",
    ) as AnalyticsEventRequest[];
    expect(remaining.map((item) => item.occurredAt)).toEqual([
      event(50).occurredAt,
      event(99).occurredAt,
    ]);
  });

  it("keeps stable IDs after an offline flush and retries later", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    await service.enqueue(event(0));
    jest
      .mocked(api.ingestAnalyticsEvents)
      .mockRejectedValueOnce(new Error("offline"));

    await service.flush(dimensions);
    const firstId = jest.mocked(api.ingestAnalyticsEvents).mock.calls[0][0]
      .events[0].eventId;
    expect(await service.queueLength()).toBe(1);
    jest.mocked(api.ingestAnalyticsEvents).mockResolvedValueOnce({
      accepted: true,
      inserted: 0,
    });
    await service.flush(dimensions);
    const retriedId = jest.mocked(api.ingestAnalyticsEvents).mock.calls[1][0]
      .events[0].eventId;
    expect(retriedId).toBe(firstId);
    expect(await service.queueLength()).toBe(0);
  });

  it("keeps a resolved account opt-out authoritative over later consent loading", async () => {
    const service = new AnalyticsService();
    await service.applyAccountPreference(false);
    await service.resolveConsent(true);
    await service.enqueue(event(0));

    expect(await service.queueLength()).toBe(0);
    expect(await service.preferenceState()).toEqual(
      expect.objectContaining({
        consent: true,
        accountEnabled: false,
        enabled: false,
      }),
    );
    expect(api.setAnalyticsPreference).not.toHaveBeenCalled();
  });

  it("persists an offline opt-out and retries it before any event batch", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    await service.enqueue(event(0));
    jest
      .mocked(api.setAnalyticsPreference)
      .mockRejectedValueOnce(new Error("offline"));

    await expect(service.setPreference(false)).resolves.toBe("pending");
    expect(await service.queueLength()).toBe(0);
    expect((await service.preferenceState()).pendingPreference).toBe(false);

    jest
      .mocked(api.setAnalyticsPreference)
      .mockResolvedValueOnce({ enabled: false });
    const restarted = new AnalyticsService();
    await restarted.flush(dimensions);
    expect(api.setAnalyticsPreference).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(api.ingestAnalyticsEvents).not.toHaveBeenCalled();
    expect(await restarted.preferenceState()).toEqual(
      expect.objectContaining({ enabled: false, pendingPreference: null }),
    );
  });

  it("does not enable collection until the backend confirms opt-in", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    jest
      .mocked(api.setAnalyticsPreference)
      .mockRejectedValueOnce(new Error("offline"));
    await expect(service.setPreference(true)).resolves.toBe("pending");
    await service.enqueue(event(0));
    expect(await service.queueLength()).toBe(0);

    jest
      .mocked(api.setAnalyticsPreference)
      .mockResolvedValueOnce({ enabled: true });
    await service.flush(dimensions);
    await service.enqueue(event(1));
    expect(await service.queueLength()).toBe(1);
  });

  it("applies the account preference without overwriting it through PUT", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    await service.enqueue(event(0));
    await service.applyAccountPreference(false);

    expect(await service.queueLength()).toBe(0);
    await service.enqueue(event(1));
    expect(await service.queueLength()).toBe(0);
    expect(api.setAnalyticsPreference).not.toHaveBeenCalled();
    expect(await service.preferenceState()).toEqual(
      expect.objectContaining({ accountEnabled: false, enabled: false }),
    );
  });

  it("does not let a pending guest opt-in bypass an account opt-out", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    jest
      .mocked(api.setAnalyticsPreference)
      .mockRejectedValueOnce(new Error("offline"));
    await service.setPreference(true);

    await service.applyAccountPreference(false);
    await service.flush(dimensions);

    expect(api.setAnalyticsPreference).toHaveBeenCalledTimes(1);
    expect(await service.preferenceState()).toEqual(
      expect.objectContaining({
        accountEnabled: false,
        enabled: false,
        pendingPreference: null,
      }),
    );
  });

  it("keeps a pending opt-out after login until the backend confirms it", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    jest
      .mocked(api.setAnalyticsPreference)
      .mockRejectedValueOnce(new Error("offline"));
    await service.setPreference(false);
    await service.applyAccountPreference(true);

    jest
      .mocked(api.setAnalyticsPreference)
      .mockResolvedValueOnce({ enabled: false });
    await service.flush(dimensions);

    expect(api.setAnalyticsPreference).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(await service.preferenceState()).toEqual(
      expect.objectContaining({ enabled: false, pendingPreference: null }),
    );
  });

  it("clears and disables the queue when ingestion is declined", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    await service.enqueue(event(0));
    jest.mocked(api.ingestAnalyticsEvents).mockResolvedValueOnce({
      accepted: false,
      inserted: 0,
    });

    await service.flush(dimensions);
    expect(await service.queueLength()).toBe(0);
    expect(await service.preferenceState()).toEqual(
      expect.objectContaining({ accountEnabled: false, enabled: false }),
    );
  });

  it("falls back safely from malformed persisted state and queue", async () => {
    await AsyncStorage.multiSet([
      ["@foodler_analytics_state", JSON.stringify({ enabled: true })],
      ["@foodler_analytics_queue", JSON.stringify({ eventId: "bad" })],
    ]);
    const service = new AnalyticsService();
    expect(await service.preferenceState()).toEqual({
      consent: false,
      enabled: false,
      pendingPreference: null,
      accountEnabled: null,
    });
    expect(await service.queueLength()).toBe(0);
  });
});
