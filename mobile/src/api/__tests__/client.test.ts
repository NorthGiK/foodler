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
});
