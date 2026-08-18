import type { Period, Receipt, ReceiptItem } from "./types";
import { FALLBACK_CATEGORY, normalizeCategory } from "./category";

export type PeriodSelection = {
  period: Period;
  anchor: Date;
};

export type ExpenseSeriesPoint = {
  label: string;
  value: number;
};

export type CategoryExpense = {
  label: string;
  value: number;
  percentage: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeek(date: Date): Date {
  const result = startOfDay(date);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

export function startOfPeriod(date: Date, period: Period): Date {
  if (period === "day") return startOfDay(date);
  if (period === "week") return startOfWeek(date);
  if (period === "month") {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
  return new Date(date.getFullYear(), 0, 1);
}

export function currentPeriodSelection(
  period: Period,
  now = new Date(),
): PeriodSelection {
  return { period, anchor: startOfPeriod(now, period) };
}

export function endOfPeriod(date: Date, period: Period): Date {
  const start = startOfPeriod(date, period);
  if (period === "day") return new Date(start.getTime() + DAY_MS - 1);
  if (period === "week") return new Date(start.getTime() + DAY_MS * 7 - 1);
  if (period === "month") {
    return new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
  }
  return new Date(start.getFullYear() + 1, 0, 0, 23, 59, 59, 999);
}

export function shiftPeriod(date: Date, period: Period, amount: number): Date {
  const result = startOfPeriod(date, period);
  if (period === "day") result.setDate(result.getDate() + amount);
  if (period === "week") result.setDate(result.getDate() + amount * 7);
  if (period === "month") result.setMonth(result.getMonth() + amount);
  if (period === "year") result.setFullYear(result.getFullYear() + amount);
  return result;
}

export function isFuturePeriod(
  selection: PeriodSelection,
  now = new Date(),
): boolean {
  return (
    startOfPeriod(selection.anchor, selection.period).getTime() >
    startOfPeriod(now, selection.period).getTime()
  );
}

export function filterReceiptsBySelection(
  receipts: readonly Receipt[],
  selection: PeriodSelection,
): Receipt[] {
  const start = startOfPeriod(selection.anchor, selection.period).getTime();
  const end = endOfPeriod(selection.anchor, selection.period).getTime();
  return receipts.filter((receipt) => {
    const timestamp = new Date(receipt.ticketDate).getTime();
    return timestamp >= start && timestamp <= end;
  });
}

export function totalForSelection(
  receipts: readonly Receipt[],
  selection: PeriodSelection,
): number {
  return filterReceiptsBySelection(receipts, selection).reduce(
    (sum, receipt) => sum + Math.abs(receipt.totalSumRub),
    0,
  );
}

export function formatPeriodLabel(selection: PeriodSelection): string {
  const start = startOfPeriod(selection.anchor, selection.period);
  const capitalize = (value: string) =>
    value.charAt(0).toLocaleUpperCase("ru-RU") + value.slice(1);
  if (selection.period === "day") {
    return capitalize(
      new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(start),
    );
  }
  if (selection.period === "week") {
    const end = endOfPeriod(selection.anchor, selection.period);
    const left = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
    }).format(start);
    const right = new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(end);
    return `${left} — ${right}`;
  }
  if (selection.period === "month") {
    return capitalize(
      new Intl.DateTimeFormat("ru-RU", {
        month: "long",
        year: "numeric",
      }).format(start),
    );
  }
  return String(start.getFullYear());
}

function monthDays(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric" }).format(date);
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { month: "short" })
    .format(date)
    .replace(".", "");
}

export function buildExpenseSeries(
  receipts: readonly Receipt[],
  selection: PeriodSelection,
): ExpenseSeriesPoint[] {
  const start = startOfPeriod(selection.anchor, selection.period);
  const points: { date: Date; label: string }[] = [];
  if (selection.period === "day") {
    for (let hour = 0; hour < 24; hour += 1) {
      const date = new Date(start);
      date.setHours(hour);
      points.push({ date, label: `${String(hour).padStart(2, "0")}ч` });
    }
  } else if (selection.period === "week") {
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      points.push({
        date,
        label: new Intl.DateTimeFormat("ru-RU", { weekday: "short" })
          .format(date)
          .replace(".", ""),
      });
    }
  } else if (selection.period === "month") {
    for (let day = 0; day < monthDays(start); day += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      points.push({ date, label: formatDayLabel(date) });
    }
  } else {
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(start.getFullYear(), month, 1);
      points.push({ date, label: formatMonthLabel(date) });
    }
  }

  return points.map(({ date, label }) => {
    const value = receipts.reduce((total, receipt) => {
      const receiptDate = new Date(receipt.ticketDate);
      let matches = receiptDate.getFullYear() === date.getFullYear();
      matches = matches && receiptDate.getMonth() === date.getMonth();
      if (
        selection.period === "day" ||
        selection.period === "month" ||
        selection.period === "week"
      ) {
        matches = matches && receiptDate.getDate() === date.getDate();
      }
      if (selection.period === "day") {
        matches = matches && receiptDate.getHours() === date.getHours();
      }
      return matches ? total + Math.abs(receipt.totalSumRub) : total;
    }, 0);
    return { label, value };
  });
}

export function buildCategoryExpenses(
  receipts: readonly Receipt[],
  items: readonly ReceiptItem[],
  selection: PeriodSelection,
): CategoryExpense[] {
  const filtered = filterReceiptsBySelection(receipts, selection);
  const receiptIds = new Set(filtered.map((receipt) => receipt.id));
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!receiptIds.has(item.receiptId)) continue;
    const normalized = normalizeCategory(item.category);
    const label =
      normalized === FALLBACK_CATEGORY
        ? "Другое"
        : normalized.charAt(0).toLocaleUpperCase("ru-RU") + normalized.slice(1);
    totals.set(label, (totals.get(label) ?? 0) + Math.abs(item.sumRub));
  }

  const total = filtered.reduce(
    (sum, receipt) => sum + Math.abs(receipt.totalSumRub),
    0,
  );
  const categorizedTotal = [...totals.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  if (total > categorizedTotal + 0.01) {
    totals.set(
      "Другое",
      (totals.get("Другое") ?? 0) + total - categorizedTotal,
    );
  }

  const categoryTotal = [...totals.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  if (categoryTotal <= 0) return [];
  return [...totals.entries()]
    .map(([label, value]) => ({
      label,
      value,
      percentage: Math.round((value / categoryTotal) * 100),
    }))
    .sort((a, b) => b.value - a.value);
}
