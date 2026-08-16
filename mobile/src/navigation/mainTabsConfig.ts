export type MainTabParamList = {
  Receipts: undefined;
  Stats: undefined;
  Assistant: undefined;
  Profile: undefined;
};

type TabDefinition = {
  name: keyof MainTabParamList;
  title: string;
  icon: "receipt-long" | "bar-chart" | "smart-toy" | "person";
};

export const MAIN_TABS: readonly TabDefinition[] = [
  { name: "Receipts", title: "Чеки", icon: "receipt-long" },
  { name: "Stats", title: "Статистика", icon: "bar-chart" },
  { name: "Assistant", title: "AI", icon: "smart-toy" },
  { name: "Profile", title: "Профиль", icon: "person" },
];
