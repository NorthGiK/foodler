import { MAIN_TABS } from "../mainTabsConfig";

describe("MainTabs", () => {
  it("registers exactly four persistent user-facing tabs", () => {
    expect(MAIN_TABS).toEqual([
      { name: "Receipts", title: "Чеки", icon: "receipt-long" },
      { name: "Stats", title: "Статистика", icon: "bar-chart" },
      { name: "Assistant", title: "AI", icon: "smart-toy" },
      { name: "Profile", title: "Профиль", icon: "person" },
    ]);
  });
});
