import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ApiError,
  clearTokens,
  getAccessToken,
  setTokens,
  unwrap,
} from "../transport";

describe("API transport", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("stores and clears auth tokens", async () => {
    await setTokens("access", "refresh");
    expect(await getAccessToken()).toBe("access");

    await clearTokens();
    expect(await getAccessToken()).toBeNull();
  });

  it("unwraps successful generated client responses", async () => {
    await expect(
      unwrap(Promise.resolve({ data: { ok: true } })),
    ).resolves.toEqual({ ok: true });
  });

  it("normalizes generated client errors", async () => {
    const response = new Response(null, { status: 429 });

    await expect(
      unwrap(
        Promise.resolve({
          data: undefined,
          error: { detail: "credits exhausted" },
          response,
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: "ApiError",
        message: "credits exhausted",
        status: 429,
      }),
    );
  });
});
