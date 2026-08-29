import AsyncStorage from "@react-native-async-storage/async-storage";

import { api } from "@/api/client";

import { myTracker } from "./myTracker";

const STATE_KEY = "@foodler_analytics_identity_state_v2";

export type AnalyticsPreferenceState = {
  consent: boolean;
  enabled: boolean;
  pendingPreference: boolean | null;
  accountEnabled: boolean | null;
  analyticsExternalId?: string | null;
};

const DEFAULT_STATE: AnalyticsPreferenceState = {
  consent: false,
  enabled: false,
  pendingPreference: null,
  accountEnabled: null,
  analyticsExternalId: null,
};

function isState(value: unknown): value is AnalyticsPreferenceState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.consent === "boolean" &&
    typeof state.enabled === "boolean" &&
    (typeof state.pendingPreference === "boolean" ||
      state.pendingPreference === null) &&
    (typeof state.accountEnabled === "boolean" ||
      state.accountEnabled === null) &&
    (typeof state.analyticsExternalId === "string" ||
      state.analyticsExternalId === null)
  );
}

async function readState(): Promise<AnalyticsPreferenceState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed: unknown = JSON.parse(raw);
    return isState(parsed) ? parsed : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

async function writeState(state: AnalyticsPreferenceState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

/** Consent-gated bridge. It never persists event payloads locally. */
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

  async preferenceState(): Promise<AnalyticsPreferenceState> {
    return this.run(readState);
  }

  async resolveConsent(consent: boolean): Promise<void> {
    await this.run(async () => {
      const current = await readState();
      await writeState({ ...current, consent });
      if (consent) {
        await myTracker.start();
        await myTracker.setCustomUserId(
          current.accountEnabled ? (current.analyticsExternalId ?? "") : "",
        );
      } else {
        await myTracker.stopIdentity();
      }
    });
  }

  async applyAccountPreference(
    accountEnabled: boolean,
    analyticsExternalId: string | null,
  ): Promise<void> {
    await this.run(async () => {
      const current = await readState();
      const pendingPreference =
        current.pendingPreference === false && accountEnabled ? false : null;
      const enabled =
        current.consent && pendingPreference === null && accountEnabled;
      await writeState({
        ...current,
        accountEnabled,
        analyticsExternalId,
        pendingPreference,
        enabled,
      });
      if (current.consent) await myTracker.start();
      await myTracker.setCustomUserId(
        enabled ? (analyticsExternalId ?? "") : "",
      );
    });
  }

  async setPreference(enabled: boolean): Promise<"synced" | "pending"> {
    return this.run(async () => {
      const current = await readState();
      if (current.accountEnabled === null) {
        const next = { ...current, enabled: current.consent && enabled };
        await writeState(next);
        if (current.consent) await myTracker.start();
        await myTracker.stopIdentity();
        return "synced";
      }
      const pending = {
        ...current,
        enabled: false,
        pendingPreference: enabled,
      };
      await writeState(pending);
      // An offline opt-out is immediate; opt-in remains off until PUT succeeds.
      await myTracker.stopIdentity();
      try {
        const response = await api.setAnalyticsIdentityPreference({ enabled });
        const next = {
          ...pending,
          accountEnabled: response.enabled,
          analyticsExternalId: response.analyticsExternalId,
          pendingPreference: null,
          enabled: pending.consent && response.enabled,
        };
        await writeState(next);
        if (pending.consent) await myTracker.start();
        await myTracker.setCustomUserId(
          response.enabled ? (response.analyticsExternalId ?? "") : "",
        );
        return "synced";
      } catch {
        return "pending";
      }
    });
  }

  async retryPending(): Promise<void> {
    const state = await this.preferenceState();
    if (state.pendingPreference !== null)
      await this.setPreference(state.pendingPreference);
    await myTracker.flush();
  }

  async track(
    eventName: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    const state = await this.preferenceState();
    if (!state.consent) return;
    const identityMode =
      state.accountEnabled === null
        ? "guest"
        : state.accountEnabled && state.analyticsExternalId
          ? "authenticated"
          : "anonymous";
    await myTracker.trackEvent(eventName, { ...properties, identityMode });
  }

  async clearAccount(): Promise<void> {
    await this.run(async () => {
      const current = await readState();
      await writeState({
        ...current,
        accountEnabled: null,
        analyticsExternalId: null,
        pendingPreference: null,
      });
      await myTracker.stopIdentity();
      if (current.consent) await myTracker.start();
    });
  }
}

export const analytics = new AnalyticsService();
