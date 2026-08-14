import { api } from "../api/client";
import { FamilyMember, Receipt, ReceiptItem } from "../types";
import { loadProfile } from "../profileStorage";
import {
  ACTION_LABELS,
  ACTION_TO_SERVER,
  AiActionType,
  AiResult,
  AiSection,
} from "./types";

interface PurchaseContext {
  receipts: Receipt[];
  items: (ReceiptItem & { ticketDate?: string })[];
  periodFrom?: string;
  periodTo?: string;
  members?: FamilyMember[];
}

function familyMemberToApiMember(member: FamilyMember) {
  const infoParts: string[] = [];
  const dietaryPrefs = member.dietaryPreferences || [];
  if (dietaryPrefs.length > 0) {
    infoParts.push(dietaryPrefs.join(", "));
  }
  if (member.additionalInfo) {
    infoParts.push(member.additionalInfo);
  }

  return {
    name: member.name,
    age: member.age,
    height: member.heightCm != null ? member.heightCm : 0,
    weight: member.weightKg != null ? member.weightKg : 0,
    gender: member.gender === "male" ? "Мужской" : "Женский",
    additional_info: infoParts.join(". "),
  };
}

export type AiErrorKind = "network" | "server" | "rate_limit" | "unknown";

export class AiServiceError extends Error {
  kind: AiErrorKind;
  cause: unknown;
  constructor(kind: AiErrorKind, message: string, cause?: unknown) {
    super(message);
    this.kind = kind;
    this.cause = cause;
  }
}

/**
 * Парсит серверные секции, раскрывая вложенные JSON-массивы в поле `text`.
 * Сервер иногда возвращает одну секцию типа `text`, у которой `text` содержит
 * JSON-строку с массивом под-секций. Эта функция рекурсивно разворачивает такие
 * секции в плоский массив AiSection.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sectionTitle(section: Record<string, unknown>) {
  return typeof section.title === "string" ? section.title : "";
}

function listItemToText(item: unknown) {
  if (typeof item === "string") return item;
  if (!isRecord(item)) return String(item);

  const name = typeof item.name === "string" ? item.name : "";
  if (!name) return JSON.stringify(item);
  const ingredients = Array.isArray(item.ingredients)
    ? item.ingredients.filter(
        (ingredient): ingredient is string => typeof ingredient === "string",
      )
    : [];
  const preparation =
    typeof item.preparation === "string" ? item.preparation : "";
  return `${name}${ingredients.length ? `: ${ingredients.join(", ")}` : ""}${
    preparation ? ` — ${preparation}` : ""
  }`;
}

export function parseServerSections(serverSections: unknown[]): AiSection[] {
  const result: AiSection[] = [];

  for (const rawSection of serverSections) {
    if (!isRecord(rawSection) || typeof rawSection.type !== "string") continue;
    const section = rawSection;

    if (
      section.type === "text" &&
      typeof section.text === "string" &&
      section.text.trim().startsWith("[")
    ) {
      try {
        const nested: unknown = JSON.parse(section.text);
        if (Array.isArray(nested)) {
          result.push(...parseServerSections(nested));
          continue;
        }
      } catch {
        // Preserve malformed nested JSON as ordinary text.
      }
    }

    if (section.type === "text" && typeof section.text === "string") {
      result.push({
        type: "text",
        title: sectionTitle(section),
        text: section.text,
      });
      continue;
    }

    if (section.type === "list" && Array.isArray(section.items)) {
      result.push({
        type: "list",
        title: sectionTitle(section),
        items: section.items.map(listItemToText),
      });
      continue;
    }

    if (section.type === "score" && typeof section.value === "number") {
      result.push({
        type: "score",
        title: sectionTitle(section),
        value: section.value,
        max: typeof section.max === "number" ? section.max : undefined,
      });
      continue;
    }

    if (section.type === "products" && Array.isArray(section.products)) {
      const products = section.products.flatMap((product) => {
        if (
          !isRecord(product) ||
          typeof product.name !== "string" ||
          typeof product.reason !== "string"
        ) {
          return [];
        }
        return [
          {
            name: product.name,
            reason: product.reason,
            price:
              typeof product.price === "number" ? product.price : undefined,
          },
        ];
      });
      result.push({
        type: "products",
        title: sectionTitle(section),
        products,
      });
      continue;
    }

    if (
      section.type === "chart" &&
      Array.isArray(section.labels) &&
      section.labels.every((label) => typeof label === "string") &&
      Array.isArray(section.values) &&
      section.values.every((value) => typeof value === "number")
    ) {
      result.push({
        type: "chart",
        title: sectionTitle(section),
        labels: section.labels,
        values: section.values,
        kind: section.kind === "line" ? "line" : "bar",
      });
    }
  }

  return result;
}

function getErrorDetails(error: unknown) {
  if (!isRecord(error)) return { message: "", status: undefined };
  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";
  const statusCandidate = error.status ?? error.statusCode ?? error.code;
  const status =
    typeof statusCandidate === "number" ? statusCandidate : undefined;
  return { message, status };
}

/**
 * Строго серверный вызов. При ошибке пробрасывает AiServiceError,
 * чтобы UI показал соответствующий экран.
 */
export async function generateAiResponse(
  action: AiActionType,
  context: PurchaseContext,
): Promise<AiResult> {
  const serverAction = ACTION_TO_SERVER[action];

  const parameters: Record<string, unknown> = {};
  if (context.periodFrom) parameters.periodFrom = context.periodFrom;
  if (context.periodTo) parameters.periodTo = context.periodTo;
  if (context.members && context.members.length > 0) {
    parameters.members = context.members.map(familyMemberToApiMember);
  }
  const profile = await loadProfile();
  const profileParts = [
    profile.healthGoals.length ? `Цели: ${profile.healthGoals.join(", ")}` : "",
    profile.dietaryPreferences.length
      ? `Ограничения: ${profile.dietaryPreferences.join(", ")}`
      : "",
    profile.additionalInfo ? `Дополнительно: ${profile.additionalInfo}` : "",
  ].filter(Boolean);
  if (profileParts.length) parameters.profile_context = profileParts.join(". ");

  try {
    const result = await api.runAiAction(serverAction, parameters);

    return {
      id:
        result.id ||
        `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: action,
      title: ACTION_LABELS[action],
      summary: "",
      sections: parseServerSections(result.sections || []),
    };
  } catch (error: unknown) {
    const { message, status } = getErrorDetails(error);

    let kind: AiErrorKind = "unknown";
    if (message.includes("network") || message.includes("fetch")) {
      kind = "network";
    } else if (
      message.includes("429") ||
      (typeof status === "number" && status === 429)
    ) {
      kind = "rate_limit";
    } else if (
      message.includes("server") ||
      ["502", "503", "504"].some((code) => message.includes(code)) ||
      (typeof status === "number" && status >= 500) ||
      status === 401
    ) {
      kind = "server";
    }

    const userMessage =
      kind === "network"
        ? "Проблема с интернетом. Проверьте подключение и попробуйте снова."
        : kind === "server"
          ? "Сервер сейчас недоступен. Попробуйте позже."
          : kind === "rate_limit"
            ? "Закончились действия. Подождите или оформите подписку."
            : "Что-то пошло не так. Попробуйте ещё раз.";

    throw new AiServiceError(kind, userMessage, error);
  }
}
