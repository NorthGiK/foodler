import type { AiActionType } from "@/ai/types";
import { ApiError } from "@/api/transport";
import { analyticsTriggers } from "./triggers";

export type AnalyticsFailureCode =
  "network" | "validation" | "unavailable" | "cancelled" | "unknown";
export type ReceiptCaptureSource = "qr" | "image";
export type AnalyticsPlan = "budget_monthly" | "premium_monthly";
export type AnalyticsTab = "Receipts" | "Stats" | "Assistant" | "Profile";

export class AnalyticsCancelledError extends Error {
  override name = "AnalyticsCancelledError";
}

type AuthEvent = Extract<
  import("@/api/generated/types.gen").AnalyticsEventName,
  | "registration_started"
  | "registration_succeeded"
  | "registration_failed"
  | "login_started"
  | "login_succeeded"
  | "login_failed"
  | "logout"
>;
type ReceiptCaptureEvent = Extract<
  import("@/api/generated/types.gen").AnalyticsEventName,
  | "receipt_capture_started"
  | "receipt_capture_succeeded"
  | "receipt_capture_failed"
>;
type AiEvent = Extract<
  import("@/api/generated/types.gen").AnalyticsEventName,
  "ai_action_started" | "ai_action_succeeded" | "ai_action_failed"
>;

function durationMs(startedAt: number): number {
  return Math.min(600_000, Math.max(0, Date.now() - startedAt));
}

export function analyticsFailureCode(error: unknown): AnalyticsFailureCode {
  if (error instanceof AnalyticsCancelledError) return "cancelled";
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 422) return "validation";
    if (
      error.status === 429 ||
      (error.status !== undefined && error.status >= 500)
    ) {
      return "unavailable";
    }
    return error.status === undefined ? "network" : "unknown";
  }
  if (error instanceof Error && error.name === "AbortError") return "network";
  if (error instanceof TypeError) return "network";
  return "unknown";
}

const allowedParams = new Set([
  "screen_name",
  "source",
  "failure_code",
  "action_id",
  "plan_id",
  "period",
  "entry_mode",
  "duration_ms",
  "build_channel",
]);
function firebaseParams(
  properties: Record<string, unknown>,
): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  const aliases: Record<string, string> = {
    failureCode: "failure_code",
    actionId: "action_id",
    durationMs: "duration_ms",
    plan: "plan_id",
    tab: "screen_name",
  };
  for (const [key, value] of Object.entries(properties)) {
    const name = aliases[key] ?? key;
    if (
      allowedParams.has(name) &&
      (typeof value === "string" || typeof value === "number")
    )
      params[name] = value;
  }
  const channel = process.env.EXPO_PUBLIC_BUILD_CHANNEL;
  if (channel === "preview" || channel === "production")
    params.build_channel = channel;
  return params;
}
async function event(
  eventName: import("@/api/generated/types.gen").AnalyticsEventName,
  properties: Record<string, unknown> = {},
): Promise<void> {
  await analyticsTriggers.enqueueAndMaybeFlush({
    name: eventName,
    params: firebaseParams(properties),
  });
}

export const analyticsEvents = {
  appOpened: () => event("app_opened"),
  tabViewed: (tab: AnalyticsTab) => event("tab_viewed", { tab }),
  policyAccepted: (policy: "privacy" | "terms", version: "1.1") =>
    event("policy_accepted", { policy, version }),
  auth: (name: AuthEvent, error?: unknown) =>
    event(
      name,
      name.endsWith("_failed")
        ? { failureCode: analyticsFailureCode(error) }
        : {},
    ),
  receiptCapture: (
    name: ReceiptCaptureEvent,
    source: ReceiptCaptureSource,
    startedAt: number,
    error?: unknown,
  ) =>
    event(name, {
      source,
      durationMs: durationMs(startedAt),
      ...(name === "receipt_capture_failed"
        ? { failureCode: analyticsFailureCode(error) }
        : {}),
    }),
  receiptManualCreated: () => event("receipt_manual_created"),
  receiptDetailViewed: () => event("receipt_detail_viewed"),
  receiptDeleted: () => event("receipt_deleted"),
  aiScreenViewed: () => event("ai_screen_viewed"),
  ai: (
    name: AiEvent,
    actionId: AiActionType,
    startedAt: number,
    error?: unknown,
  ) =>
    event(name, {
      actionId,
      ...(name === "ai_action_started"
        ? {}
        : { durationMs: durationMs(startedAt) }),
      ...(name === "ai_action_failed"
        ? { failureCode: analyticsFailureCode(error) }
        : {}),
    }),
  subscriptionScreenViewed: () => event("subscription_screen_viewed"),
  subscriptionPlan: (plan: AnalyticsPlan) =>
    event("subscription_plan_selected", { plan }),
  subscriptionTermsViewed: () => event("subscription_terms_viewed"),
  checkoutOpened: (plan: AnalyticsPlan) =>
    event("subscription_checkout_opened", { plan }),
  checkoutFailed: (plan: AnalyticsPlan, error: unknown) =>
    event("subscription_checkout_failed", {
      plan,
      failureCode: analyticsFailureCode(error),
    }),
  feedbackSubmitted: () => event("feedback_submitted"),
};
