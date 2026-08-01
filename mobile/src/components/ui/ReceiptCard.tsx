import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { ReceiptItem, type Receipt } from "../../types";
import { fmtDate, fmtRub } from "../../utils";
import { AnimatedPressable } from "../animations/AnimatedPressable";
import { useTheme } from "../ThemeContext";

interface ReceiptCardProps {
  receipt: Receipt;
  items?: ReceiptItem[];
  onPress?: () => void;
  onDelete?: () => void;
  style?: ViewStyle;
}

export function ReceiptCard({
  receipt,
  items,
  onPress,
  onDelete,
  style,
}: ReceiptCardProps) {
  const { theme } = useTheme();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      onDelete?.();
      setDeleteModalVisible(false);
    } catch (e) {
      console.error("Failed to delete receipt", e);
    } finally {
      setDeleting(false);
    }
  };

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={styles.leftAccent}>
        <View
          style={[styles.accentDot, { backgroundColor: theme.primary }]}
        />
      </View>
      <View style={styles.infoContainer}>
        <Text style={[styles.org, { color: theme.text, maxWidth: "50%" }]} numberOfLines={1}>
          {receipt.organization}
        </Text>
        {receipt.ticketDate && (
          <View style={styles.metaRow}>
            <MaterialIcons
              name="calendar-today"
              size={12}
              color={theme.muted}
            />
            <Text style={[styles.meta, { color: theme.muted }]}>
              {fmtDate(receipt.ticketDate)}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.sumContainer}>
        <Text style={[styles.sum, { color: theme.primary }]}>
          {fmtRub(receipt.totalSumRub)}
        </Text>
      </View>
    </View>
  );

  return (
    <>
      {onPress ? (
        <AnimatedPressable scaleTo={0.97} onPress={onPress} style={style}>
          {content}
        </AnimatedPressable>
      ) : (
        <View style={style}>{content}</View>
      )}

      {items && items.length > 0 && (
        <View style={[styles.itemsWrapper, { borderColor: theme.border }]}>
          {items.map((item, idx) => (
            <View
              key={item.id ?? idx}
              style={[
                styles.itemRow,
                idx < items.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.itemMeta, { color: theme.muted }]}>
                  {item.category} · {item.quantity} × {fmtRub(item.priceRub)}
                </Text>
              </View>
              <Text style={[styles.itemPrice, { color: theme.primary }]}>
                {fmtRub(item.sumRub)}
              </Text>
            </View>
          ))}

          {/* Delete button */}
          <AnimatedPressable
            scaleTo={0.95}
            onPress={() => setDeleteModalVisible(true)}
            style={styles.deleteButtonWrapper}
          >
            <View
              style={[
                styles.deleteButton,
                { backgroundColor: theme.error + "15" },
              ]}
            >
              <MaterialIcons name="delete-outline" size={18} color={theme.error} />
              <Text style={[styles.deleteButtonText, { color: theme.error }]}>
                Удалить чек
              </Text>
            </View>
          </AnimatedPressable>
        </View>
      )}

      {/* Confirmation modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => !deleting && setDeleteModalVisible(false)}
        >
          <Pressable
            style={[
              styles.dialog,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
            onPress={() => { }}
          >
            <View style={styles.dialogIconWrapper}>
              <View style={[styles.dialogIconCircle, { backgroundColor: theme.error + "15" }]}>
                <MaterialIcons name="delete-forever" size={32} color={theme.error} />
              </View>
            </View>
            <Text style={[styles.dialogTitle, { color: theme.text }]}>
              Удалить чек
            </Text>
            <Text style={[styles.dialogMessage, { color: theme.muted }]}>
              Вы уверенны, что хотите навсегда удалить чек?
            </Text>
            <View style={styles.dialogButtons}>
              <Pressable
                style={[
                  styles.dialogButton,
                  styles.dialogButtonCancel,
                  { backgroundColor: theme.surfaceElevated },
                ]}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deleting}
              >
                <Text style={[styles.dialogButtonCancelText, { color: theme.text }]}>
                  Отказаться
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.dialogButton,
                  styles.dialogButtonConfirm,
                  { backgroundColor: theme.error },
                ]}
                onPress={handleDelete}
                disabled={deleting}
              >
                <Text style={[styles.dialogButtonConfirmText, { color: theme.white }]}>
                  {deleting ? "Удаление..." : "Согласиться"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  leftAccent: {
    width: 3,
    height: 40,
    borderRadius: 2,
    marginRight: 14,
    justifyContent: "center",
  },
  accentDot: {
    width: 3,
    height: 30,
    borderRadius: 2,
  },
  infoContainer: {
    flex: 1,
    justifyContent: "space-between",
  },
  org: {
    fontWeight: "600",
    fontSize: 15,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  meta: {
    fontSize: 12,
  },
  sumContainer: {
    marginLeft: 12,
  },
  sum: {
    fontWeight: "800",
    fontSize: 16,
  },
  itemsWrapper: {
    marginTop: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 12,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 11,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: "700",
  },
  deleteButtonWrapper: {
    marginTop: 8,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  deleteButtonText: {
    fontWeight: "700",
    fontSize: 14,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  dialog: {
    width: "100%",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    alignItems: "center",
  },
  dialogIconWrapper: {
    marginBottom: 16,
  },
  dialogIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  dialogMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  dialogButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  dialogButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  dialogButtonCancel: {
    borderWidth: 0,
  },
  dialogButtonCancelText: {
    fontWeight: "700",
    fontSize: 15,
  },
  dialogButtonConfirm: {
    borderWidth: 0,
  },
  dialogButtonConfirmText: {
    fontWeight: "800",
    fontSize: 15,
  },
});