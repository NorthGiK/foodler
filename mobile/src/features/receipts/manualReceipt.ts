import { detectCategory } from "../../category";
import type { Receipt, ReceiptItem } from "../../types";

export interface ReceiptDraftItem {
  id: string;
  name: string;
  priceRub: string;
  quantity: string;
}

export interface ManualReceiptDraft {
  organization: string;
  date: string;
  items: ReceiptDraftItem[];
}

export interface ManualReceiptResult {
  receipt: Receipt;
  items: ReceiptItem[];
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function createDraftItem(): ReceiptDraftItem {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    priceRub: "",
    quantity: "1",
  };
}

function parsePositiveDecimal(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseLocalDate(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function validateManualReceipt(draft: ManualReceiptDraft) {
  const errors: Record<string, boolean> = {};

  if (!draft.organization.trim()) errors.organization = true;
  if (!parseLocalDate(draft.date)) errors.date = true;
  if (draft.items.length === 0) errors.items = true;

  for (const item of draft.items) {
    if (!item.name.trim()) errors[item.id] = true;
    if (!parsePositiveDecimal(item.priceRub)) {
      errors[`${item.id}_price`] = true;
    }
    if (!parsePositiveDecimal(item.quantity)) {
      errors[`${item.id}_quantity`] = true;
    }
  }

  return errors;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateManualReceiptTotal(items: ReceiptDraftItem[]) {
  return roundMoney(
    items.reduce((total, item) => {
      const price = parsePositiveDecimal(item.priceRub) ?? 0;
      const quantity = parsePositiveDecimal(item.quantity) ?? 0;
      return total + roundMoney(price * quantity);
    }, 0),
  );
}

export function buildManualReceipt(
  draft: ManualReceiptDraft,
  now = new Date(),
  idSuffix = Math.random().toString(36).slice(2, 10),
): ManualReceiptResult {
  const errors = validateManualReceipt(draft);
  if (Object.keys(errors).length > 0) {
    throw new Error("Manual receipt draft is invalid");
  }

  const ticketDate = parseLocalDate(draft.date);
  if (!ticketDate) throw new Error("Manual receipt date is invalid");

  const receiptId = `manual:${now.getTime()}:${idSuffix}`;
  const items = draft.items.map((item) => {
    const priceRub = parsePositiveDecimal(item.priceRub);
    const quantity = parsePositiveDecimal(item.quantity);
    if (priceRub === null || quantity === null) {
      throw new Error("Manual receipt item is invalid");
    }
    return {
      receiptId,
      name: item.name.trim(),
      category: detectCategory(item.name),
      priceRub,
      quantity,
      sumRub: roundMoney(priceRub * quantity),
    };
  });

  const receipt: Receipt = {
    id: receiptId,
    qrraw: receiptId,
    organization: draft.organization.trim(),
    ticketDate: ticketDate.toISOString(),
    operationType: 3,
    totalSumRub: calculateManualReceiptTotal(draft.items),
    sourceCode: 1,
    createdAt: now.getTime(),
  };

  return { receipt, items };
}
