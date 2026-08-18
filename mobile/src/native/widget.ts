import { NativeModules, Platform } from "react-native";
import { currentPeriodSelection, totalForSelection } from "../stats";
import type { Receipt } from "../types";

type FoodlerWidgetNativeModule = {
  updateWeeklyExpense: (totalKopeks: number, weekStart: string) => void;
};

const modules = NativeModules as unknown as {
  FoodlerWidget?: FoodlerWidgetNativeModule;
};

function formatWeekStart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function updateWeeklyWidget(receipts: readonly Receipt[]): void {
  if (Platform.OS !== "android") return;
  const selection = currentPeriodSelection("week");
  const totalRub = totalForSelection(receipts, selection);
  modules.FoodlerWidget?.updateWeeklyExpense(
    Math.round(totalRub * 100),
    formatWeekStart(selection.anchor),
  );
}
