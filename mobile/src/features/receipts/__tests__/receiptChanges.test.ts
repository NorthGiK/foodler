import {
  batchReceiptChanges,
  notifyReceiptChange,
  subscribeToReceiptChanges,
} from "../receiptChanges";

describe("receipt change notifications", () => {
  it("coalesces a mutation batch and allows unsubscribing", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToReceiptChanges(listener);

    notifyReceiptChange();
    notifyReceiptChange();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    notifyReceiptChange();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("emits once after an asynchronous mutation batch completes", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToReceiptChanges(listener);

    await batchReceiptChanges(async () => {
      notifyReceiptChange();
      await Promise.resolve();
      notifyReceiptChange();
    });
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
