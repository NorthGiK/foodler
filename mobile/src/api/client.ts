import AsyncStorage from "@react-native-async-storage/async-storage";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import { Platform } from "react-native";

import { API_BASE } from "@/config";
import type { ApiReceiptResponse } from "@/types";

import { Sdk } from "./generated/sdk.gen";
import type {
  AiRequestParameters,
  AnalyticsEventsRequest,
  AnalyticsPreferenceRequest,
  ReceiptCreateSchema,
  SubscriptionStatusResponse,
} from "./generated/types.gen";
import { getAccessToken, unwrap } from "./transport";

export {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./transport";

const sdk = new Sdk();

type ReceiptJson = NonNullable<NonNullable<ApiReceiptResponse["data"]>["json"]>;
type ReceiptJsonItem = NonNullable<ReceiptJson["items"]>[number];
export type SubscriptionPlan = NonNullable<SubscriptionStatusResponse["plan"]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function receiptItem(value: unknown): ReceiptJsonItem | null {
  if (!isRecord(value)) return null;
  return {
    name: stringValue(value.name),
    quantity: numberValue(value.quantity),
    price: numberValue(value.price),
    sum: numberValue(value.sum),
    gtin: stringValue(value.gtin),
    category: stringValue(value.category),
    category_source: stringValue(value.category_source),
    category_confidence: numberValue(value.category_confidence),
    category_taxonomy_version: stringValue(value.category_taxonomy_version),
    category_model_version: stringValue(value.category_model_version),
  };
}

function receiptJson(value: unknown): ReceiptJson | undefined {
  if (!isRecord(value)) return undefined;
  const rawItems = value.items;
  const items = Array.isArray(rawItems)
    ? rawItems
        .map(receiptItem)
        .filter((item): item is ReceiptJsonItem => item !== null)
    : undefined;
  return {
    ticketDate: stringValue(value.ticketDate),
    operationType: numberValue(value.operationType),
    totalSum: numberValue(value.totalSum),
    user: stringValue(value.user),
    dateTime: stringValue(value.dateTime),
    fiscalDriveNumber: stringValue(value.fiscalDriveNumber),
    fiscalDocumentNumber:
      stringValue(value.fiscalDocumentNumber) ??
      numberValue(value.fiscalDocumentNumber),
    fiscalSign: stringValue(value.fiscalSign) ?? numberValue(value.fiscalSign),
    items,
  };
}

function normalizeReceiptProviderResponse(
  response: unknown,
): ApiReceiptResponse {
  if (!isRecord(response) || typeof response.code !== "number") {
    throw new Error("Receipt provider returned an invalid response");
  }

  const rawData = response.data;
  const data = isRecord(rawData)
    ? (() => {
        const json = receiptJson(rawData.json);
        return json ? { json } : undefined;
      })()
    : undefined;
  const rawRequest = response.request;
  const receiptId = stringValue(response.receiptId);
  const request =
    isRecord(rawRequest) && typeof rawRequest.qrraw === "string"
      ? { qrraw: rawRequest.qrraw }
      : undefined;

  return { code: response.code, data, request, receiptId };
}

export async function getReceiptFromQR(
  data: string,
): Promise<ApiReceiptResponse> {
  const response = await unwrap(
    sdk.getReceiptByQrApiReceiptsGetReceiptByQrPost({
      body: { qrraw: data },
    }),
  );
  return normalizeReceiptProviderResponse(response);
}

export async function getReceiptByRawQR(
  imgPath: string,
): Promise<ApiReceiptResponse> {
  const fileUri = imgPath.startsWith("file://") ? imgPath : `file://${imgPath}`;
  const accessToken = await getAccessToken();
  const result = await uploadAsync(
    `${API_BASE}/receipts/get_receipt_by_raw_qr`,
    fileUri,
    {
      httpMethod: "POST",
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: "qrfile",
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
    },
  );

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Receipt upload failed with HTTP ${result.status}`);
  }
  return normalizeReceiptProviderResponse(JSON.parse(result.body) as unknown);
}

export async function getAvaibleCredits(): Promise<{
  remaining: number;
  limit: number;
}> {
  const data = await unwrap(sdk.getCreditsApiAiCreditsGet());
  if (data.period_limit < data.remaining) {
    throw new Error("Server returned an invalid credits balance");
  }
  await AsyncStorage.setItem("available_credits", data.remaining.toString());
  return { remaining: data.remaining, limit: data.period_limit };
}

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem("device_id");
  if (!id) {
    id = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem("device_id", id);
  }
  return id;
}

export const api = {
  ingestAnalyticsEvents(body: AnalyticsEventsRequest) {
    return unwrap(sdk.ingestEventsApiProductAnalyticsEventsPost({ body }));
  },

  setAnalyticsPreference(body: AnalyticsPreferenceRequest) {
    return unwrap(sdk.setPreferenceApiProductAnalyticsPreferencePut({ body }));
  },

  login(email: string, password: string) {
    return unwrap(sdk.loginApiAuthLoginPost({ body: { email, password } }));
  },

  sendCode(email: string, password: string) {
    return unwrap(
      sdk.sendCodeApiAuthSendCodePost({ body: { email, password } }),
    );
  },

  verifyCode(email: string, code: string, password?: string) {
    return unwrap(
      sdk.verifyCodeApiAuthVerifyCodePost({
        body: { email, code, password: password ?? null },
      }),
    );
  },

  forgotPasswordSendCode(email: string) {
    return unwrap(
      sdk.forgotPasswordSendCodeApiAuthForgotPasswordSendCodePost({
        body: { email },
      }),
    );
  },

  forgotPasswordVerifyCode(email: string, code: string, newPassword: string) {
    return unwrap(
      sdk.forgotPasswordVerifyCodeApiAuthForgotPasswordVerifyCodePost({
        body: { email, code, new_password: newPassword },
      }),
    );
  },

  getMe() {
    return unwrap(sdk.getMeApiUsersMeGet());
  },

  registerDevice(deviceId: string, model?: string, os?: string) {
    return unwrap(
      sdk.registerDeviceApiDevicesRegisterPost({
        body: {
          deviceId,
          model: model ?? null,
          os: os ?? null,
        },
      }),
    );
  },

  getReceipts(offset = 0, limit = 100) {
    return unwrap(
      sdk.getReceiptsApiReceiptsGet({
        query: { offset, limit },
      }),
    );
  },

  createReceipt(data: ReceiptCreateSchema) {
    return unwrap(sdk.uploadReceiptApiReceiptsPost({ body: data }));
  },

  deleteReceipt(id: string) {
    return unwrap(
      sdk.deleteReceiptApiReceiptsReceiptIdDelete({
        path: { receipt_id: id },
      }),
    );
  },

  createReceiptsArray(receipts: ReceiptCreateSchema[]) {
    return unwrap(
      sdk.uploadReceiptsApiReceiptsArrayPost({
        body: { receipts },
      }),
    );
  },

  getAiHistory() {
    return unwrap(sdk.getHistoryApiAiHistoryGet());
  },

  getAiReport(id: string) {
    return unwrap(
      sdk.getReportApiAiHistoryReportIdGet({
        path: { report_id: id },
      }),
    );
  },

  deleteAiReport(id: string) {
    return unwrap(
      sdk.deleteReportApiAiHistoryReportIdDelete({
        path: { report_id: id },
      }),
    );
  },

  runAiAction(action: string, parameters?: AiRequestParameters) {
    return unwrap(
      sdk.runAiApiAiRunPost({
        body: { action, parameters: parameters ?? null },
      }),
    );
  },

  searchProducts(query: string, limit = 10) {
    return unwrap(
      sdk.searchProductsApiProductsSearchGet({
        query: { query, limit },
      }),
    );
  },

  getProduct(id: string) {
    return unwrap(
      sdk.getProductApiProductsProductIdGet({
        path: { product_id: id },
      }),
    );
  },

  matchProduct(rawName: string, quantity = 1) {
    return unwrap(
      sdk.matchProductEndpointApiProductsMatchPost({
        body: { raw_name: rawName, quantity, unit: null },
      }),
    );
  },

  getRecipeSuggestions(limit = 5) {
    return unwrap(
      sdk.suggestRecipesEndpointApiRecipesSuggestGet({
        query: { limit },
      }),
    );
  },

  getSpendingAnalysis(fromDate?: string, toDate?: string) {
    return unwrap(
      sdk.spendingAnalysisApiAnalyticsSpendingGet({
        query: {
          from_date: fromDate ?? null,
          to_date: toDate ?? null,
        },
      }),
    );
  },

  getNutritionAnalysis(fromDate?: string, toDate?: string) {
    return unwrap(
      sdk.nutritionAnalysisApiAnalyticsNutritionGet({
        query: {
          from_date: fromDate ?? null,
          to_date: toDate ?? null,
        },
      }),
    );
  },

  getFridgeStatus() {
    return unwrap(sdk.fridgeStatusApiFridgeGet());
  },

  sendFeedback(email: string, text: string, images: string[]) {
    return unwrap(
      sdk.sendFeedbackApiUsersSendFeedbackPost({
        body: { email, text, images },
      }),
    );
  },

  getTags() {
    return unwrap(sdk.listTagsApiTagsGet());
  },

  async isPremium(): Promise<boolean> {
    if (!(await getAccessToken())) return false;
    const data = await unwrap(sdk.isPremiumApiSubscriptionIsPremiumGet());
    return data.premium;
  },

  getSubscription() {
    return unwrap(sdk.getSubscriptionApiSubscriptionGet());
  },

  async makePurchase(plan: SubscriptionPlan): Promise<string | undefined> {
    if (!(await getAccessToken())) return undefined;
    const data = await unwrap(
      sdk.createPaymentApiSubscriptionPaymentPost({ body: { plan } }),
    );
    return data.confirmationUrl;
  },
};
