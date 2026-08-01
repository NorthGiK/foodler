import AsyncStorage from "@react-native-async-storage/async-storage";
import { uploadAsync } from "expo-file-system/legacy";

import { getReceiptByRawQR } from "../client";
import { setTokens } from "../transport";

jest.mock("expo-file-system/legacy", () => ({
  FileSystemUploadType: { MULTIPART: 1 },
  uploadAsync: jest.fn(),
}));

describe("receipt image upload", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.mocked(uploadAsync).mockReset();
  });

  it("requires authentication before uploading", async () => {
    await expect(getReceiptByRawQR("/receipt.jpg")).rejects.toThrow(
      "Authentication is required",
    );
    expect(uploadAsync).not.toHaveBeenCalled();
  });

  it("sends the access token with the multipart upload", async () => {
    await setTokens("access-token", "refresh-token");
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
        headers: { Authorization: "Bearer access-token" },
      }),
    );
  });
});
