import AsyncStorage from "@react-native-async-storage/async-storage";

import { api } from "@/api/client";
import type {
  AnalyticsEventRequest,
  AnalyticsEventsRequest,
} from "@/api/generated/types.gen";

const INSTALLATION_KEY = "@foodler_analytics_installation";
const STATE_KEY = "@foodler_analytics_state";
const QUEUE_KEY = "@foodler_analytics_queue";
const MAX_QUEUE = 500;
const MAX_BATCH = 50;

export const ANALYTICS_FLUSH_THRESHOLD = MAX_BATCH;

export type AnalyticsPreferenceState = {
  consent: boolean;
  enabled: boolean;
  pendingPreference: boolean | null;
  accountEnabled: boolean | null;
};

type QueuedEvent = AnalyticsEventRequest;
type AnalyticsDimensions = Omit<
  AnalyticsEventsRequest,
  "installationId" | "events"
>;

const DEFAULT_STATE: AnalyticsPreferenceState = {
  consent: false,
  enabled: false,
  pendingPreference: null,
  accountEnabled: null,
};

let idSequence = 0;

function randomId(): string {
  idSequence += 1;
  const random = Math.random().toString(36).slice(2).padEnd(16, "0");
  return `${Date.now().toString(36)}_${idSequence.toString(36)}_${random}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseState(raw: string | null): AnalyticsPreferenceState {
  if (!raw) return DEFAULT_STATE;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      typeof value.consent !== "boolean" ||
      typeof value.enabled !== "boolean"
    ) {
      return DEFAULT_STATE;
    }
    const pendingPreference =
      typeof value.pendingPreference === "boolean"
        ? value.pendingPreference
        : null;
    const accountEnabled =
      typeof value.accountEnabled === "boolean" ? value.accountEnabled : null;
    return {
      consent: value.consent,
      enabled: value.consent && value.enabled && pendingPreference === null,
      pendingPreference,
      accountEnabled,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function parseQueue(raw: string | null): QueuedEvent[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((event): event is QueuedEvent => {
      if (!isRecord(event)) return false;
      return (
        typeof event.eventId === "string" &&
        typeof event.eventName === "string" &&
        typeof event.occurredAt === "string"
      );
    });
  } catch {
    return [];
  }
}

export class AnalyticsService {
  private readonly sessionId = randomId();
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

  private async readQueue(): Promise<QueuedEvent[]> {
    return parseQueue(await AsyncStorage.getItem(QUEUE_KEY));
  }

  private async installationIdUnlocked(): Promise<string> {
    const stored = await AsyncStorage.getItem(INSTALLATION_KEY);
    if (stored && stored.length >= 16) return stored;
    const id = randomId();
    await AsyncStorage.setItem(INSTALLATION_KEY, id);
    return id;
  }

  async installationId(): Promise<string> {
    return this.run(() => this.installationIdUnlocked());
  }

  async preferenceState(): Promise<AnalyticsPreferenceState> {
    return this.run(() => this.readState());
  }

  async resolveConsent(
    consent: boolean,
    accountEnabled?: boolean,
  ): Promise<void> {
    await this.run(async () => {
      const current = await this.readState();
      const resolvedAccount = accountEnabled ?? current.accountEnabled;
      const firstAcceptance = consent && !current.consent;
      const enabledByPreference =
        resolvedAccount ?? (firstAcceptance ? true : current.enabled);
      const enabled =
        consent && current.pendingPreference === null && enabledByPreference;
      await this.writeState({
        consent,
        enabled,
        pendingPreference: current.pendingPreference,
        accountEnabled: resolvedAccount,
      });
      if (!enabled) await AsyncStorage.removeItem(QUEUE_KEY);
    });
  }

  async applyAccountPreference(accountEnabled: boolean): Promise<void> {
    await this.run(async () => {
      const current = await this.readState();
      const pendingPreference =
        current.pendingPreference === false && accountEnabled ? false : null;
      const enabled =
        current.consent && pendingPreference === null && accountEnabled;
      await this.writeState({
        ...current,
        enabled,
        accountEnabled,
        pendingPreference,
      });
      if (!enabled) await AsyncStorage.removeItem(QUEUE_KEY);
    });
  }

  async enqueue(
    event: Omit<AnalyticsEventRequest, "eventId" | "sessionId">,
  ): Promise<void> {
    await this.run(async () => {
      const state = await this.readState();
      if (!state.consent || !state.enabled) return;
      const queue = await this.readQueue();
      queue.push({ ...event, eventId: randomId(), sessionId: this.sessionId });
      await AsyncStorage.setItem(
        QUEUE_KEY,
        JSON.stringify(queue.slice(-MAX_QUEUE)),
      );
    });
  }

  async queueLength(): Promise<number> {
    return this.run(async () => (await this.readQueue()).length);
  }

  async setPreference(enabled: boolean): Promise<"synced" | "pending"> {
    return this.run(async () => {
      const current = await this.readState();
      const pendingState: AnalyticsPreferenceState = {
        ...current,
        enabled: false,
        pendingPreference: enabled,
      };
      await this.writeState(pendingState);
      if (!enabled) await AsyncStorage.removeItem(QUEUE_KEY);
      try {
        const response = await api.setAnalyticsPreference({
          installationId: await this.installationIdUnlocked(),
          enabled,
        });
        await this.writeState({
          ...pendingState,
          accountEnabled: response.enabled,
          enabled: current.consent && response.enabled,
          pendingPreference: null,
        });
        return "synced";
      } catch {
        return "pending";
      }
    });
  }

  async flush(dimensions: AnalyticsDimensions): Promise<void> {
    await this.run(async () => {
      let state = await this.readState();
      if (state.pendingPreference !== null) {
        try {
          const response = await api.setAnalyticsPreference({
            installationId: await this.installationIdUnlocked(),
            enabled: state.pendingPreference,
          });
          state = {
            ...state,
            accountEnabled: response.enabled,
            enabled: state.consent && response.enabled,
            pendingPreference: null,
          };
          await this.writeState(state);
        } catch {
          return;
        }
      }

      if (!state.consent || !state.enabled) return;
      const queue = await this.readQueue();
      const batch = queue.slice(0, MAX_BATCH);
      if (batch.length === 0) return;

      try {
        const response = await api.ingestAnalyticsEvents({
          ...dimensions,
          installationId: await this.installationIdUnlocked(),
          events: batch,
        });
        if (!response.accepted) {
          await this.writeState({
            ...state,
            accountEnabled: false,
            enabled: false,
            pendingPreference: null,
          });
          await AsyncStorage.removeItem(QUEUE_KEY);
          return;
        }
      } catch {
        return;
      }

      const acknowledged = new Set(batch.map((event) => event.eventId));
      const latest = await this.readQueue();
      await AsyncStorage.setItem(
        QUEUE_KEY,
        JSON.stringify(
          latest.filter((event) => !acknowledged.has(event.eventId)),
        ),
      );
    });
  }
}

export const analytics = new AnalyticsService();
