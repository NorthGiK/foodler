const listeners = new Set<() => void>();
let notificationQueued = false;
let batchDepth = 0;
let batchChanged = false;

export function notifyReceiptChange() {
  if (batchDepth > 0) {
    batchChanged = true;
    return;
  }
  if (notificationQueued) return;
  notificationQueued = true;
  queueMicrotask(() => {
    notificationQueued = false;
    listeners.forEach((listener) => listener());
  });
}

export async function batchReceiptChanges<T>(task: () => Promise<T>) {
  batchDepth += 1;
  try {
    return await task();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0 && batchChanged) {
      batchChanged = false;
      notifyReceiptChange();
    }
  }
}

export function subscribeToReceiptChanges(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
