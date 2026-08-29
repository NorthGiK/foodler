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

type AuthEvent =
  | "registration_started"
  | "registration_succeeded"
  | "registration_failed"
  | "login_started"
  | "login_succeeded"
  | "login_failed"
  | "logout"
;
type ReceiptCaptureEvent =
  | "receipt_capture_started"
  | "receipt_capture_succeeded"
  | "receipt_capture_failed"
;
type AiEvent =
  "ai_action_started" | "ai_action_succeeded" | "ai_action_failed"
;

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

async function event(
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  await analyticsTriggers.enqueueAndMaybeFlush({
    eventName,
    occurredAt: new Date().toISOString(),
    properties,
  });
}

export const analyticsEvents = {
  appOpened: () => event("app_opened"),
  tabViewed: (tab: AnalyticsTab) => event("tab_viewed", { tab }),
  policyAccepted: (policy: "privacy" | "terms", version: "1.2") =>
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
