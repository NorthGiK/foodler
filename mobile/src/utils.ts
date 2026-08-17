import { CategoryMode, Period, Receipt, ReceiptItem } from "./types";
import { normalizeCategory } from "./category";

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function groupReceiptItems(items: ReceiptItem[]): ReceiptItem[] {
  const grouped = new Map<string, ReceiptItem>();

  for (const item of items) {
    const normalizedName = item.name.trim().toLocaleLowerCase("ru-RU");
    const priceKopeks = Math.round(item.priceRub * 100);
    const key = `${normalizedName}\u0000${priceKopeks}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.quantity += item.quantity;
      existing.sumRub += item.sumRub;
      continue;
    }

    grouped.set(key, { ...item });
  }

  return [...grouped.values()];
}

export type ReceiptCategoryTotal = { label: string; sumRub: number };

export function buildReceiptCategoryTotals(
  items: ReceiptItem[],
): ReceiptCategoryTotal[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const category = normalizeCategory(item.category);
    totals.set(category, (totals.get(category) ?? 0) + item.sumRub);
  }

  return [...totals.entries()]
    .map(([label, sumRub]) => ({ label, sumRub }))
    .sort(
      (a, b) => b.sumRub - a.sumRub || a.label.localeCompare(b.label, "ru-RU"),
    );
}

// Группировка чеков по дням / неделям / месяцам
export function buildAllTimeSeries(
  receipts: Receipt[],
  step: Period,
): { label: string; value: number; date: Date }[] {
  if (receipts.length === 0) return [];

  const sorted = [...receipts].sort(
    (a, b) =>
      new Date(a.ticketDate).getTime() - new Date(b.ticketDate).getTime(),
  );
  const minDate = startOfDay(new Date(sorted[0].ticketDate));
  // Set maxDate to end of today (23:59:59.999) to ensure today is always included
  const maxDate = new Date();
  maxDate.setHours(23, 59, 59, 999);

  const points: { label: string; value: number; date: Date }[] = [];
  const totals = new Map<number, number>();
  const bucketStart = (receipt: Receipt) => {
    const date = startOfDay(new Date(receipt.ticketDate));
    if (step === "week") {
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    } else if (step === "month") {
      date.setDate(1);
    } else if (step === "year") {
      date.setMonth(0, 1);
    }
    return date.getTime();
  };
  for (const receipt of receipts) {
    const key = bucketStart(receipt);
    totals.set(key, (totals.get(key) ?? 0) + receipt.totalSumRub);
  }

  if (step === "day") {
    const cursor = new Date(minDate);
    while (cursor <= maxDate) {
      points.push({
        label: cursor.toLocaleDateString("ru", {
          day: "2-digit",
          month: "2-digit",
        }),
        value: totals.get(cursor.getTime()) ?? 0,
        date: new Date(cursor),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (step === "week") {
    // Начинаем с понедельника недели, содержащей minDate
    const cursor = new Date(minDate);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7)); // пн
    while (cursor <= maxDate) {
      points.push({
        label: `${cursor.toLocaleDateString("ru", { day: "2-digit", month: "2-digit" })}`,
        value: totals.get(cursor.getTime()) ?? 0,
        date: new Date(cursor),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else if (step === "month") {
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cursor <= maxDate) {
      points.push({
        label: cursor.toLocaleDateString("ru", {
          month: "short",
          year: "2-digit",
        }),
        value: totals.get(cursor.getTime()) ?? 0,
        date: new Date(cursor),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (step === "year") {
    // для всего диапазона лет
    const startYear = minDate.getFullYear();
    const endYear = maxDate.getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      const first = new Date(y, 0, 1);
      points.push({
        label: String(y),
        value: totals.get(first.getTime()) ?? 0,
        date: first,
      });
    }
  }

  return points;
}

// Форматирование валюты
export function fmtRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(value);
}

// Форматирование даты
export function fmtDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
  }
  const date = new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Вспомогательные функции для работы с датами
function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date = new Date()): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // понедельник
  d.setDate(d.getDate() - diff);
  return d;
}

function startOfMonth(date = new Date()): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function startOfYear(date = new Date()): Date {
  const d = startOfDay(date);
  d.setMonth(0, 1);
  return d;
}

// Получение диапазона дат для периода
export function getRange(period: Period): { start: Date; end: Date } {
  const end = new Date();
  if (period === "day") return { start: startOfDay(end), end };
  if (period === "week") return { start: startOfWeek(end), end };
  if (period === "month") return { start: startOfMonth(end), end };
  return { start: startOfYear(end), end };
}

// Фильтрация чеков по периоду
export function filterReceiptsByPeriod(
  receipts: Receipt[],
  period: Period,
): Receipt[] {
  const { start, end } = getRange(period);
  if (period === "year") {
    const year = new Date().getFullYear();
    return receipts.filter((r) => {
      const dt = new Date(r.ticketDate);
      return dt.getFullYear() === year;
    });
  }
  return receipts.filter((r) => {
    const dt = new Date(r.ticketDate);
    return dt >= start && dt <= end;
  });
}

// Группировка и суммирование по ключу
export function sumBy<T>(
  items: T[],
  getKey: (item: T) => string,
  getValue: (item: T) => number,
): { label: string; value: number }[] {
  const map = new Map<string, number>();

  for (const item of items) {
    const key = getKey(item);
    map.set(key, (map.get(key) ?? 0) + getValue(item));
  }

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// Построение статистики по категориям
export function buildCategoryStats(
  receipts: Receipt[],
  items: (ReceiptItem & { ticketDate?: string })[],
  period: Period,
  mode: CategoryMode,
): { label: string; value: number }[] {
  const filteredReceipts = filterReceiptsByPeriod(receipts, period);
  const allowedIds = new Set(filteredReceipts.map((r) => r.id));
  const filteredItems = items.filter((item) => allowedIds.has(item.receiptId));

  if (mode === "count") {
    return sumBy(
      filteredItems,
      (item) => item.category,
      () => 1,
    );
  }

  return sumBy(
    filteredItems,
    (item) => item.category,
    (item) => Math.abs(item.sumRub),
  );
}
