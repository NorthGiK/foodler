import { ReceiptCard } from "@/components/ui";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../App";
import { api, getAccessToken } from "../api/client";
import { useTheme } from "../components/ThemeContext";
import { deleteReceipt, loadReceiptItems, openDb } from "../storage";
import { ReceiptItem } from "../types";

export function ReceiptDetailScreen() {
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "ReceiptDetail">>();
  const receipt = route.params.receipt;
  const [items, setItems] = useState<ReceiptItem[]>([]);

  useEffect(() => {
    loadItems();
  }, [receipt.id]);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [receipt.id]),
  );

  const loadItems = async () => {
    try {
      const db = await openDb();
      const loaded = await loadReceiptItems(db, receipt.id);
      console.debug(`Loaded ${loaded.length} items for receipt ${receipt.id}`);
      setItems(loaded);
    } catch (e) {
      console.warn("Failed to load receipt items", e);
    }
  };

  const handleDelete = async () => {
    try {
      const db = await openDb();
      await deleteReceipt(db, receipt.id);
      navigation.goBack();

      // Delete from server if authenticated
      const token = await getAccessToken();
      if (token) {
        try {
          await api.deleteReceipt(receipt.id);
        } catch (e) {
          console.warn("Failed to delete receipt from server", e);
        }
      }
      // Delete locally
    } catch (e) {
      console.error("Failed to delete receipt", e);
      Alert.alert("Ошибка", "Не удалось удалить чек");
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.headerButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: "#000" }]}
          numberOfLines={2}
        >
          {receipt.organization}
        </Text>
        {/* <View style={styles.headerButton} /> */}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ReceiptCard
          receipt={receipt}
          items={items}
          onDelete={handleDelete}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerButton: {
    position: "absolute",
    paddingRight: 50,
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    maxWidth: 70,
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 4,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
});