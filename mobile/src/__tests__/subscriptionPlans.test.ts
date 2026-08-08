import { subscriptionActionLabel } from "@/subscriptionPlans";

describe("subscriptionActionLabel", () => {
  it("labels an active plan as a renewal", () => {
    expect(subscriptionActionLabel("budget_monthly", "budget_monthly")).toBe(
      "Продлить",
    );
  });

  it("labels a Basic-to-Premium purchase as an upgrade", () => {
    expect(subscriptionActionLabel("premium_monthly", "budget_monthly")).toBe(
      "Перейти на Premium",
    );
  });

  it("labels an inactive plan as a new purchase", () => {
    expect(subscriptionActionLabel("budget_monthly", null)).toBe("Оформить");
  });
});
