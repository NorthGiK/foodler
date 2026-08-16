import { type SQLiteDatabase } from "expo-sqlite";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "../../api/auth";
import {
  pullServerReceipts,
  syncAiReports,
  syncAllLocalReceiptsBulk,
  syncPendingReceiptDeletions,
} from "../../api/sync";
import { initAiReportsTable } from "../../ai/storage";
import {
  batchReceiptChanges,
  loadJoinedItems,
  loadReceipts,
  openDb,
  saveReceipt,
  subscribeToReceiptChanges,
} from "../../storage";
import {
  loadStoreAliases,
  removeStoreAlias,
  saveStoreAlias,
  type StoreAliases,
} from "../../storeAliases";
import type { Receipt, ReceiptItem } from "../../types";

type JoinedItem = ReceiptItem & { ticketDate?: string };
type AppData = {
  db: SQLiteDatabase | null;
  receipts: Receipt[];
  joinedItems: JoinedItem[];
  storeAliases: StoreAliases;
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  initializeStorage: () => Promise<void>;
  saveLocalStoreAlias: (store: string, alias: string) => Promise<void>;
  restoreLocalStoreAlias: (store: string) => Promise<void>;
};
const AppDataContext = createContext<AppData | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [joinedItems, setJoinedItems] = useState<JoinedItem[]>([]);
  const [storeAliases, setStoreAliases] = useState<StoreAliases>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const refreshSequence = useRef(0);
  const refreshDatabase = useCallback(async (database: SQLiteDatabase) => {
    const sequence = ++refreshSequence.current;
    try {
      const [nextReceipts, nextJoinedItems] = await Promise.all([
        loadReceipts(database),
        loadJoinedItems(database),
      ]);
      if (sequence !== refreshSequence.current) return;
      setReceipts(nextReceipts);
      setJoinedItems(nextJoinedItems);
      setLoadError(null);
    } catch {
      if (sequence !== refreshSequence.current) return;
      setLoadError("Не удалось загрузить локальные данные");
    }
  }, []);
  const refresh = useCallback(async () => {
    if (db) await refreshDatabase(db);
  }, [db, refreshDatabase]);
  const initializeStorage = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const database = await openDb();
      setDb(database);
      await refreshDatabase(database);
    } catch {
      setLoadError("Не удалось открыть локальное хранилище");
    } finally {
      setLoading(false);
    }
  }, [refreshDatabase]);
  useEffect(() => {
    void initializeStorage();
  }, [initializeStorage]);
  useEffect(() => {
    void loadStoreAliases()
      .then(setStoreAliases)
      .catch(() => setStoreAliases({}));
  }, []);
  const saveLocalStoreAlias = useCallback(
    async (store: string, alias: string) => {
      const updated = await saveStoreAlias(storeAliases, store, alias);
      setStoreAliases(updated);
    },
    [storeAliases],
  );
  const restoreLocalStoreAlias = useCallback(
    async (store: string) => {
      const updated = await removeStoreAlias(storeAliases, store);
      setStoreAliases(updated);
    },
    [storeAliases],
  );
  useEffect(() => {
    if (!db) return;
    return subscribeToReceiptChanges(() => {
      void refreshDatabase(db);
    });
  }, [db, refreshDatabase]);
  useEffect(() => {
    if (!isAuthenticated || !db) return;
    let synchronizing = false;
    let syncQueued = false;
    const pushLocalReceipts = async () => {
      if (synchronizing) {
        syncQueued = true;
        return;
      }
      synchronizing = true;
      try {
        await syncAllLocalReceiptsBulk(db);
      } finally {
        synchronizing = false;
        if (syncQueued) {
          syncQueued = false;
          void pushLocalReceipts();
        }
      }
    };
    void (async () => {
      try {
        await syncPendingReceiptDeletions();
        await pushLocalReceipts();
        const serverData = await pullServerReceipts(db);
        if (serverData.receipts.length > 0)
          await batchReceiptChanges(async () => {
            for (const receipt of serverData.receipts)
              await saveReceipt(
                db,
                receipt,
                serverData.items.filter(
                  (item) => item.receiptId === receipt.id,
                ),
              );
          });
        await initAiReportsTable(db);
        await syncAiReports(db);
      } catch {
        console.warn("Background synchronization failed");
      }
    })();
    return subscribeToReceiptChanges(() => {
      void pushLocalReceipts();
    });
  }, [isAuthenticated, db]);
  return (
    <AppDataContext.Provider
      value={{
        db,
        receipts,
        joinedItems,
        storeAliases,
        loading,
        loadError,
        refresh,
        initializeStorage,
        saveLocalStoreAlias,
        restoreLocalStoreAlias,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value)
    throw new Error("useAppData must be used within an AppDataProvider");
  return value;
}
