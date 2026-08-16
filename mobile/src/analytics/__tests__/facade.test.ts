import { ApiError } from "@/api/transport";

import {
  AnalyticsCancelledError,
  analyticsEvents,
  analyticsFailureCode,
} from "../facade";
import { analyticsTriggers } from "../triggers";

jest.mock("../triggers", () => ({
  analyticsTriggers: { enqueueAndMaybeFlush: jest.fn() },
}));

describe("analytics event facade", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(analyticsTriggers.enqueueAndMaybeFlush)
      .mockResolvedValue(undefined);
    jest.spyOn(Date, "now").mockReturnValue(1_500);
  });

  afterEach(() => jest.restoreAllMocks());

  it("emits the approved auth and receipt taxonomy with safe properties", async () => {
    const privateError = new ApiError("private server message", 422, {
      email: "private@example.invalid",
    });

    await analyticsEvents.auth("registration_started");
    await analyticsEvents.auth("registration_failed", privateError);
    await analyticsEvents.receiptCapture(
      "receipt_capture_started",
      "qr",
      1_000,
    );
    await analyticsEvents.receiptCapture(
      "receipt_capture_failed",
      "image",
      1_000,
      new AnalyticsCancelledError(),
    );
    await analyticsEvents.receiptManualCreated();

    const events = jest.mocked(analyticsTriggers.enqueueAndMaybeFlush).mock
      .calls;
    expect(events.map(([event]) => event.eventName)).toEqual([
      "registration_started",
      "registration_failed",
      "receipt_capture_started",
      "receipt_capture_failed",
      "receipt_manual_created",
    ]);
    expect(events[1][0].properties).toEqual({ failureCode: "validation" });
    expect(events[2][0].properties).toEqual({
      source: "qr",
      durationMs: 500,
    });
    expect(events[3][0].properties).toEqual({
      source: "image",
      durationMs: 500,
      failureCode: "cancelled",
    });
    expect(JSON.stringify(events)).not.toContain("private");
  });

  it("emits AI and subscription outcomes without claiming payment success", async () => {
    await analyticsEvents.ai("ai_action_started", "analysis", 1_000);
    await analyticsEvents.ai("ai_action_succeeded", "analysis", 1_000);
    await analyticsEvents.ai(
      "ai_action_failed",
      "ask",
      1_000,
      new TypeError("secret prompt"),
    );
    await analyticsEvents.subscriptionPlan("premium_monthly");
    await analyticsEvents.checkoutOpened("premium_monthly");
    await analyticsEvents.checkoutFailed(
      "budget_monthly",
      new ApiError("token value", 503),
    );

    const emitted = jest
      .mocked(analyticsTriggers.enqueueAndMaybeFlush)
      .mock.calls.map(([event]) => ({
        name: event.eventName,
        properties: event.properties,
      }));
    expect(emitted).toEqual([
      { name: "ai_action_started", properties: { actionId: "analysis" } },
      {
        name: "ai_action_succeeded",
        properties: { actionId: "analysis", durationMs: 500 },
      },
      {
        name: "ai_action_failed",
        properties: {
          actionId: "ask",
          durationMs: 500,
          failureCode: "network",
        },
      },
      {
        name: "subscription_plan_selected",
        properties: { plan: "premium_monthly" },
      },
      {
        name: "subscription_checkout_opened",
        properties: { plan: "premium_monthly" },
      },
      {
        name: "subscription_checkout_failed",
        properties: { plan: "budget_monthly", failureCode: "unavailable" },
      },
    ]);
    expect(
      emitted.some(
        (item) =>
          item.name.includes("succeeded") && item.name.includes("subscription"),
      ),
    ).toBe(false);
  });

  it("normalizes failures without exposing the original error", () => {
    expect(analyticsFailureCode(new ApiError("token", 429))).toBe(
      "unavailable",
    );
    expect(analyticsFailureCode(new ApiError("email", undefined))).toBe(
      "network",
    );
    expect(analyticsFailureCode(new Error("receipt text"))).toBe("unknown");
  });
});
