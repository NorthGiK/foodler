import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getStoreDisplayName,
  loadStoreAliases,
  removeStoreAlias,
  saveStoreAlias,
} from "../storeAliases";

describe("store aliases", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("applies a saved alias despite casing and surrounding whitespace", async () => {
    const aliases = await saveStoreAlias(
      {},
      " OOO deliveryFoods ",
      " Delivery Foods ",
    );

    expect(getStoreDisplayName("ooo DELIVERYfoods", aliases)).toBe(
      "Delivery Foods",
    );
    expect(aliases).toEqual({ "ooo deliveryfoods": "Delivery Foods" });
  });

  it("restores the receipt source name after removing an alias", async () => {
    const aliases = await saveStoreAlias(
      {},
      "OOO deliveryFoods",
      "Delivery Foods",
    );
    const restored = await removeStoreAlias(aliases, "ooo deliveryfoods");

    expect(getStoreDisplayName("OOO deliveryFoods", restored)).toBe(
      "OOO deliveryFoods",
    );
  });

  it("ignores malformed persisted aliases", async () => {
    await AsyncStorage.setItem("@foodler_store_aliases", "not-json");

    await expect(loadStoreAliases()).resolves.toEqual({});
  });
});
