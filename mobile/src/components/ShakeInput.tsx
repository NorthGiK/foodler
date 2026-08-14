import { Theme } from "@/themes";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "./ThemeContext";

interface ShakeInputProps {
  label?: string;
  error?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "number-pad" | "decimal-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  errorStyle?: StyleProp<TextStyle>;
}

export function ShakeInput({
  label,
  error,
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  secureTextEntry,
  keyboardType = "default",
  autoCapitalize = "none",
  autoCorrect = true,
  maxLength,
  autoFocus,
  style,
  inputStyle,
  errorStyle,
}: ShakeInputProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const [isPasswordVisible, setPasswordVisible] = React.useState(false);

  useEffect(() => {
    if (error) {
      shakeAnim.setValue(0);
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [error, shakeAnim]);

  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Animated.View
        style={[
          styles.inputContainer,
          error ? styles.inputError : null,
          { transform: [{ translateX: shakeAnim }] },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.inputWrapper}
        >
          <TextInput
            style={[styles.input, inputStyle]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={placeholderTextColor}
            secureTextEntry={secureTextEntry && !isPasswordVisible}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoCorrect={autoCorrect}
            maxLength={maxLength}
            autoFocus={autoFocus}
          />
        </KeyboardAvoidingView>

        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isPasswordVisible ? "Скрыть пароль" : "Показать пароль"
            }
            accessibilityHint="Переключает видимость введённого пароля"
            hitSlop={8}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={styles.passwordToggle}
          >
            <MaterialIcons
              name={isPasswordVisible ? "visibility-off" : "visibility"}
              size={22}
              color={theme.muted}
            />
          </Pressable>
        ) : null}
      </Animated.View>
      {error ? <Text style={[styles.error, errorStyle]}>{error}</Text> : null}
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    label: {
      fontSize: 14,
      fontWeight: "600",
      marginBottom: 8,
      color: theme.text,
    },
    inputContainer: {
      borderRadius: 12,
      borderWidth: 1,
      overflow: "hidden",
      borderColor: theme.outline,
      flexDirection: "row",
      alignItems: "center",
    },
    input: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.text,
    },
    inputWrapper: {
      flex: 1,
    },
    passwordToggle: {
      padding: 12,
    },
    inputError: {
      borderColor: "#ef4444",
    },
    error: {
      fontSize: 13,
      marginTop: 6,
      color: "#ef4444",
    },
  });
