import AsyncStorage from "@react-native-async-storage/async-storage";
import { uploadAsync } from "expo-file-system/legacy";

import { getReceiptByRawQR } from "../client";

jest.mock("expo-file-system/legacy", () => ({
  FileSystemUploadType: { MULTIPART: 1 },
  uploadAsync: jest.fn(),
}));

describe("receipt image upload", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(uploadAsync).mockReset();
  });

  it("uploads a receipt image without authentication", async () => {
    jest.mocked(uploadAsync).mockResolvedValue({
      body: JSON.stringify({ code: 0, data: null }),
      headers: {},
      mimeType: "application/json",
      status: 200,
    });

    await getReceiptByRawQR("/receipt.jpg");

    expect(uploadAsync).toHaveBeenCalledWith(
      expect.stringMatching(/\/receipts\/get_receipt_by_raw_qr$/),
      "file:///receipt.jpg",
      expect.objectContaining({
        fieldName: "qrfile",
        httpMethod: "POST",
      }),
    );
    expect(jest.mocked(uploadAsync).mock.calls[0][2]?.headers).toBeUndefined();
  });

  it("passes the access token when the user is signed in", async () => {
    await AsyncStorage.setItem("access_token", "access-token");
    jest.mocked(uploadAsync).mockResolvedValue({
      body: JSON.stringify({ code: 0, data: null }),
      headers: {},
      mimeType: "application/json",
      status: 200,
    });

    await getReceiptByRawQR("file:///receipt.jpg");

    expect(jest.mocked(uploadAsync).mock.calls[0][2]?.headers).toEqual({
      Authorization: "Bearer access-token",
    });
  });

  it("normalizes supported provider fields from a flexible response", async () => {
    jest.mocked(uploadAsync).mockResolvedValue({
      body: JSON.stringify({
        code: 1,
        data: {
          json: {
            ticketDate: "2026-08-06T12:16:32+00:00",
            totalSum: 15990,
            items: [{ name: "Молоко", price: 8990, unit: "шт" }],
          },
        },
        request: { qrraw: "t=20260806T1216" },
      }),
      headers: {},
      mimeType: "application/json",
      status: 200,
    });

    await expect(getReceiptByRawQR("file:///receipt.jpg")).resolves.toEqual({
      code: 1,
      data: {
        json: {
          ticketDate: "2026-08-06T12:16:32+00:00",
          totalSum: 15990,
          items: [
            {
              name: "Молоко",
              quantity: undefined,
              price: 8990,
              sum: undefined,
            },
          ],
        },
      },
      request: { qrraw: "t=20260806T1216" },
    });
  });
});
