import AsyncStorage from "@react-native-async-storage/async-storage";

export type StoreAliases = Record<string, string>;

const STORE_ALIASES_KEY = "@foodler_store_aliases";

export function normalizeStoreName(storeName: string): string {
  return storeName.trim().toLocaleLowerCase();
}

export function getStoreDisplayName(
  storeName: string,
  aliases: StoreAliases,
): string {
  return aliases[normalizeStoreName(storeName)] ?? storeName;
}

function parseStoreAliases(value: string | null): StoreAliases {
  if (!value) return {};

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const record = parsed as Record<string, unknown>;

    return Object.entries(record).reduce<StoreAliases>(
      (aliases, [key, alias]) => {
        if (typeof alias !== "string" || !alias.trim()) return aliases;
        const normalizedKey = normalizeStoreName(key);
        if (normalizedKey) aliases[normalizedKey] = alias.trim();
        return aliases;
      },
      {},
    );
  } catch {
    return {};
  }
}

export async function loadStoreAliases(): Promise<StoreAliases> {
  return parseStoreAliases(await AsyncStorage.getItem(STORE_ALIASES_KEY));
}

export async function saveStoreAlias(
  aliases: StoreAliases,
  storeName: string,
  alias: string,
): Promise<StoreAliases> {
  const key = normalizeStoreName(storeName);
  const displayName = alias.trim();
  if (!key || !displayName) {
    throw new Error("Store name and alias are required");
  }

  const updated = { ...aliases, [key]: displayName };
  await AsyncStorage.setItem(STORE_ALIASES_KEY, JSON.stringify(updated));
  return updated;
}

export async function removeStoreAlias(
  aliases: StoreAliases,
  storeName: string,
): Promise<StoreAliases> {
  const key = normalizeStoreName(storeName);
  if (!key || !(key in aliases)) return aliases;

  const updated = { ...aliases };
  delete updated[key];
  await AsyncStorage.setItem(STORE_ALIASES_KEY, JSON.stringify(updated));
  return updated;
}
