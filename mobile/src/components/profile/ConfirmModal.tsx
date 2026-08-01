import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../ThemeContext";
import FullModalWindow from "../FullModalWindow";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText,
  cancelText = "Отмена",
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmModalProps) {
  const { theme } = useTheme();

  return (
    <FullModalWindow visible={visible} setVisible={onCancel}>
      <View style={[styles.modal, { backgroundColor: theme.surface }]}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, { borderColor: theme.border }]}
            onPress={onCancel}
          >
            <Text style={[styles.btnText, { color: theme.text }]}>
              {cancelText}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.btn,
              styles.btnDanger,
              {
                backgroundColor: destructive
                  ? theme.error || "#ff4444"
                  : theme.primary,
              },
            ]}
            onPress={onConfirm}
          >
            <Text style={[styles.btnText, { color: theme.white }]}>
              {confirmText}
            </Text>
          </Pressable>
        </View>
      </View>
    </FullModalWindow>
  );
}

const styles = StyleSheet.create({
  modal: {
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  btnDanger: {
    borderWidth: 0,
  },
  btnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});