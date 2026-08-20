import { type MaterialIconsIconName } from "@react-native-vector-icons/material-icons";

export type MainTabParamList = {
  Receipts: undefined;
  Stats: undefined;
  Assistant: undefined;
  Profile: undefined;
};

type TabDefinition = {
  name: keyof MainTabParamList;
  title: string;
  icon: MaterialIconsIconName;
};

export const MAIN_TABS: readonly TabDefinition[] = [
  { name: "Receipts", title: "Чеки", icon: "receipt-long" },
  { name: "Stats", title: "Статистика", icon: "bar-chart" },
  { name: "Assistant", title: "AI", icon: "stars" },
  { name: "Profile", title: "Профиль", icon: "person" },
];
