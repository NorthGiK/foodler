import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextInput as RNTextInput,
  TextInputProps,
  ScrollView,
} from "react-native";
import { useTheme } from "../ThemeContext";

interface CashFormScreenProps {
  title: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CashFormScreen({
  title,
  children,
  style,
}: CashFormScreenProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }, style]}>
      <View style={styles.inner}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

export function CashFormSection({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.section, style]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

export function CashFormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
  style,
  inputStyle,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: TextInputProps["keyboardType"];
  error?: string;
  style?: ViewStyle;
  inputStyle?: ViewStyle;
} & TextInputProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.inputContainer, style]}>
      <Text style={[styles.inputLabel, { color: theme.text }]}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          {
            borderColor: error ? theme.error : theme.outline,
            backgroundColor: theme.surfaceElevated,
          },
        ]}
      >
        <RNTextInput
          style={[styles.textInput, { color: theme.text }, inputStyle]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          keyboardType={keyboardType}
          {...props}
        />
      </View>
      {error && (
        <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  formContainer: {
    gap: 24,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    opacity: 0.8,
  },
  sectionContent: {
    gap: 12,
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  inputWrapper: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  textInput: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
});
