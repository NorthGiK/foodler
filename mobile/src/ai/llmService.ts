import { api } from "../api/client";
import { FamilyMember, Receipt, ReceiptItem } from "../types";
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
function parseServerSections(serverSections: any[]): AiSection[] {
  const result: AiSection[] = [];

  for (const section of serverSections) {
    // Если это секция с типом text, и её text — JSON-массив, парсим вложенные секции
    if (
      section.type === 'text' &&
      typeof section.text === 'string' &&
      section.text.trim().startsWith('[')
    ) {
      try {
        const nested = JSON.parse(section.text);
        if (Array.isArray(nested)) {
          result.push(...parseServerSections(nested));
          continue;
        }
      } catch {
        // Если не удалось распарсить — падаем в обычную обработку
      }
    }

    // Для list-секций: сервер может вернуть items как массив объектов (рецепты),
    // а нам нужен массив строк. Преобразуем объекты в строки.
    let items: string[] | undefined;
    if (section.type === 'list' && Array.isArray(section.items)) {
      items = section.items.map((item: any) => {
        if (typeof item === 'string') return item;
        // Если это объект рецепта — форматируем в строку
        if (item.name) {
          let str = item.name;
          if (item.ingredients && Array.isArray(item.ingredients)) {
            str += `: ${item.ingredients.join(', ')}`;
          }
          if (item.preparation) {
            str += ` — ${item.preparation}`;
          }
          return str;
        }
        return JSON.stringify(item);
      });
    }

    // Собираем AiSection, распространяя все возможные поля
    result.push({
      type: section.type,
      title: section.title || '',
      text: section.text,
      items: items ?? section.items,
      value: section.value,
      max: section.max,
      products: section.products,
      labels: section.labels,
      values: section.values,
      kind: section.kind,
    } as AiSection);
  }

  return result;
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

  try {
    const result = await api.runAiAction(serverAction, parameters);
    console.debug("llmService.ts; generateAiResponse; ---", "result is", result);

    return {
      id:
        result.id ||
        `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: action,
      title: ACTION_LABELS[action],
      summary: "",
      sections: parseServerSections(result.sections || []),
    };
  } catch (e: any) {
    console.debug("error catched", (e as Error).message);
    const message = (e?.message || "").toLowerCase();
    const status = e?.status || e?.statusCode || e?.code;

    let kind: AiErrorKind = "unknown";
    console.debug("llmService; generateAiResponse;", "message is", message);
    if (
      message.includes("network") ||
      message.includes("fetch")
    ) {
      kind = "network";
    }
    else if (
      ["429"].some(c => message.includes(c)) ||
      (typeof status === "number" && status === 429)
    ) {
      kind = "rate_limit";
    }
    else if (
      message.includes("server") ||
      ["502", "503", "504"].some(c => message.includes(c)) ||
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
          ? "Заакончились действия. Подождите или оформите подписку"
          : "Что-то пошло не так. Попробуйте ещё раз.";

    throw new AiServiceError(kind, userMessage, e);
  }
}
