import AsyncStorage from "@react-native-async-storage/async-storage";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import { Platform } from "react-native";

import { API_BASE } from "@/config";
import type { ApiReceiptResponse } from "@/types";

import { Sdk } from "./generated/sdk.gen";
import type { AiRequestParameters, ReceiptSchema } from "./generated/types.gen";
import { getAccessToken, unwrap } from "./transport";

export {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./transport";

const sdk = new Sdk();

export async function getReceiptFromQR(
  data: string,
): Promise<ApiReceiptResponse> {
  const response = await unwrap(
    sdk.getReceiptByQrApiReceiptsGetReceiptByQrPost({
      body: { qrraw: data },
    }),
  );
  return {
    code: response.code,
    data: response.data
      ? {
          json: {
            ticketDate: response.data.json.ticketDate,
            operationType: response.data.json.operationType,
            totalSum: response.data.json.totalSum,
            user: response.data.json.user,
            items: response.data.json.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              sum: item.sum ?? undefined,
            })),
          },
        }
      : undefined,
  };
}

export async function getReceiptByRawQR(
  imgPath: string,
): Promise<ApiReceiptResponse> {
  const fileUri = imgPath.startsWith("file://") ? imgPath : `file://${imgPath}`;
  const result = await uploadAsync(
    `${API_BASE}/receipts/get_receipt_by_raw_qr`,
    fileUri,
    {
      httpMethod: "POST",
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: "qrfile",
    },
  );

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Receipt upload failed with HTTP ${result.status}`);
  }
  return JSON.parse(result.body) as ApiReceiptResponse;
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

  createReceipt(data: ReceiptSchema) {
    return unwrap(sdk.uploadReceiptApiReceiptsPost({ body: data }));
  },

  deleteReceipt(id: string) {
    return unwrap(
      sdk.deleteReceiptApiReceiptsReceiptIdDelete({
        path: { receipt_id: id },
      }),
    );
  },

  createReceiptsArray(receipts: ReceiptSchema[]) {
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

  async makePurchase(): Promise<string | undefined> {
    if (!(await getAccessToken())) return undefined;
    const data = await unwrap(sdk.createPaymentApiSubscriptionPaymentPost());
    return data.confirmationUrl;
  },
};
