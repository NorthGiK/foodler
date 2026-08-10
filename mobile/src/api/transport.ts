import AsyncStorage from "@react-native-async-storage/async-storage";

import { API_BASE, API_ORIGIN } from "@/config";

import { client } from "./generated/client.gen";
import type { HttpValidationError } from "./generated/types.gen";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const DEFAULT_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function setTokens(
  access: string,
  refresh: string,
): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, access],
    [REFRESH_TOKEN_KEY, refresh],
  ]);
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

let refreshPromise: Promise<string | null> | null = null;

function extractErrorMessage(error: unknown, status?: number): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const body = error as Partial<HttpValidationError> & {
      detail?: unknown;
      message?: unknown;
    };
    if (typeof body.detail === "string") return body.detail;
    if (typeof body.message === "string") return body.message;
  }
  return status ? `HTTP ${status}` : "Network request failed";
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      await clearTokens();
      return null;
    }

    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("accessToken" in body) ||
      !("refreshToken" in body) ||
      typeof body.accessToken !== "string" ||
      typeof body.refreshToken !== "string"
    ) {
      await clearTokens();
      return null;
    }

    await setTokens(body.accessToken, body.refreshToken);
    return body.accessToken;
  } catch {
    await clearTokens();
    return null;
  }
}

async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const request = new Request(input, init);
  const retryRequest = request.clone();
  const token = await getAccessToken();
  if (token) request.headers.set("Authorization", `Bearer ${token}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(request, { signal: controller.signal });
    const isRefreshRequest = request.url.endsWith("/auth/refresh");
    if (response.status !== 401 || isRefreshRequest) return response;

    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const newToken = await refreshPromise;
    if (!newToken) return response;

    retryRequest.headers.set("Authorization", `Bearer ${newToken}`);
    return fetch(retryRequest, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

client.setConfig({
  baseUrl: API_ORIGIN,
  fetch: authenticatedFetch,
  responseStyle: "fields",
});

export async function unwrap<T>(
  result: Promise<{
    data?: T;
    error?: unknown;
    response?: Response;
  }>,
): Promise<T> {
  const { data, error, response } = await result;
  if (error !== undefined || data === undefined) {
    throw new ApiError(
      extractErrorMessage(error, response?.status),
      response?.status,
      error,
    );
  }
  return data;
}
