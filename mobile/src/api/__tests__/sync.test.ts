import { api, getAccessToken } from "../client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  queueReceiptDeletion,
  syncPendingReceiptDeletions,
  syncReceiptToServer,
} from "../sync";
import type { Receipt, ReceiptItem } from "../../types";

jest.mock("../client", () => ({
  api: {
    createReceipt: jest.fn(),
    deleteReceipt: jest.fn(),
  },
  getAccessToken: jest.fn(),
}));

jest.mock("../../storage", () => ({
  openDb: jest.fn(),
  loadReceipts: jest.fn(),
  loadReceiptItems: jest.fn(),
}));

const receipt: Receipt = {
  id: "receipt-1",
  qrraw: "not-logged",
  organization: "Магазин",
  ticketDate: "2026-08-01T10:00:00.000Z",
  operationType: 3,
  totalSumRub: 100,
  sourceCode: 1,
  createdAt: 1,
};

const items: ReceiptItem[] = [
  {
    receiptId: receipt.id,
    name: "Молоко",
    category: "молочное",
    priceRub: 50,
    quantity: 2,
    sumRub: 100,
  },
];

describe("receipt synchronization", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    jest.mocked(getAccessToken).mockResolvedValue("access-token");
  });

  it("reports success only after the server accepts a receipt", async () => {
    jest.mocked(api.createReceipt).mockResolvedValue({ status: "ok" });

    await expect(syncReceiptToServer(receipt, items)).resolves.toBe(true);
    expect(api.createReceipt).toHaveBeenCalledWith({
      id: receipt.id,
      date: receipt.ticketDate,
      store: receipt.organization,
      total: 100,
      items: [
        {
          name: "Молоко",
          quantity: 2,
          price: 50,
          sum: 100,
        },
      ],
    });
  });

  it("does not hide a failed upload from the sync queue", async () => {
    jest
      .mocked(api.createReceipt)
      .mockRejectedValue(new Error("server unavailable"));

    await expect(syncReceiptToServer(receipt, items)).rejects.toThrow(
      "server unavailable",
    );
  });

  it("keeps a failed deletion queued for the next synchronization", async () => {
    jest.mocked(api.deleteReceipt).mockRejectedValue(new Error("offline"));

    await queueReceiptDeletion(receipt.id);
    await syncPendingReceiptDeletions();

    expect(api.deleteReceipt).toHaveBeenCalledWith(receipt.id);
    await expect(
      AsyncStorage.getItem("@pending_deleted_receipt_ids"),
    ).resolves.toContain(receipt.id);
  });

  it("removes a deletion from the queue after server confirmation", async () => {
    jest.mocked(api.deleteReceipt).mockResolvedValue(undefined);

    await queueReceiptDeletion(receipt.id);
    await syncPendingReceiptDeletions();

    await expect(
      AsyncStorage.getItem("@pending_deleted_receipt_ids"),
    ).resolves.toBeNull();
  });
});
