import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NavigationBar } from "expo-navigation-bar";
import Markdown from "react-native-markdown-display";
import { ACTION_TO_SERVER } from "../ai/types";
import { analyticsEvents } from "../analytics/facade";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import { useTheme } from "../components/ThemeContext";
import { loadProfile } from "../profileStorage";
import { FamilyMember } from "../types";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  pinned?: boolean;
}

const PINNED_MESSAGES_KEY = "@food_tracker_pinned_messages";

function familyMemberToApiMember(member: FamilyMember) {
  const infoParts: string[] = [];
  if (member.dietaryPreferences.length > 0) {
    infoParts.push(member.dietaryPreferences.join(", "));
  }
  if (member.additionalInfo) {
    infoParts.push(member.additionalInfo);
  }

  return {
    name: member.name,
    age: member.age,
    height: member.heightCm,
    weight: member.weightKg,
    gender: member.gender === "male" ? "Мужской" : "Женский",
    additional_info: infoParts.join(". "),
  };
}

export function AskScreen() {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const scrollRef = useRef<ScrollView>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    void analyticsEvents.aiScreenViewed();
  }, []);

  // Загружаем закреплённые сообщения при открытии
  useEffect(() => {
    loadPinnedMessages();
  }, []);

  const loadPinnedMessages = async () => {
    try {
      const stored = await AsyncStorage.getItem(PINNED_MESSAGES_KEY);
      if (stored) {
        const pinned = JSON.parse(stored);
        setMessages(pinned);
        messagesRef.current = pinned;
      }
    } catch {
      console.warn("Pinned messages could not be loaded");
    }
  };

  const savePinnedMessages = async (msgs: ChatMessage[]) => {
    try {
      const pinned = msgs.filter((m) => m.role === "assistant" && m.pinned);
      await AsyncStorage.setItem(PINNED_MESSAGES_KEY, JSON.stringify(pinned));
    } catch {
      console.warn("Pinned messages could not be saved");
    }
  };

  // При закрытии сохраняем закреплённые сообщения
  useEffect(() => {
    return () => {
      const currentMessages = messagesRef.current;
      void savePinnedMessages(currentMessages);
    };
  }, []);

  // Скрываем навигационную панель при открытии экрана
  useEffect(() => {
    void NavigationBar.setHidden(true);
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    // Добавляем сообщение пользователя
    const userMessage: ChatMessage = { role: "user", text };
    const updatedMessages = [...messagesRef.current, userMessage];
    setMessages(updatedMessages);
    messagesRef.current = updatedMessages;
    setInput("");
    setLoading(true);
    const startedAt = Date.now();
    void analyticsEvents.ai("ai_action_started", "ask", startedAt);

    try {
      const history = updatedMessages;

      let profileMembers:
        ReturnType<typeof familyMemberToApiMember>[] | undefined;
      try {
        const profile = await loadProfile();
        if (profile.familyMembers && profile.familyMembers.length > 0) {
          profileMembers = profile.familyMembers.map(familyMemberToApiMember);
        }
      } catch {
        // ignore if profile not available
      }

      const result = await api.runAiAction(ACTION_TO_SERVER.ask, {
        question: text,
        history: history.map((m) => ({ role: m.role, text: m.text })),
        members: profileMembers,
      });

      const answer: ChatMessage = {
        role: "assistant",
        text:
          result.sections?.find(
            (section) =>
              section.type === "text" && typeof section.text === "string",
          )?.text || "Не удалось получить ответ",
        pinned: false,
      };
      const withAnswer = [...updatedMessages, answer];
      setMessages(withAnswer);
      messagesRef.current = withAnswer;
      setErrorKind(null);
      setErrorMessage("");
      void analyticsEvents.ai("ai_action_succeeded", "ask", startedAt);
    } catch (error: unknown) {
      void analyticsEvents.ai("ai_action_failed", "ask", startedAt, error);
      setErrorKind("unknown");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Что-то пошло не так. Попробуйте ещё раз.",
      );
    } finally {
      setLoading(false);
    }
  };

  const togglePin = async (index: number) => {
    const currentMessages = messagesRef.current;
    const updated = currentMessages.map((msg, i) =>
      i === index && msg.role === "assistant"
        ? { ...msg, pinned: !msg.pinned }
        : msg,
    );
    setMessages(updated);
    messagesRef.current = updated;
    await savePinnedMessages(updated);
  };

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.chatHeader}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Задать вопрос
          </Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centerContent}>
          <MaterialIcons name="chat" size={64} color={theme.muted} />
          <Text style={[styles.centerTitle, { color: theme.text }]}>
            Войдите в аккаунт
          </Text>
          <Text style={[styles.centerText, { color: theme.muted }]}>
            Чтобы задавать вопросы AI-ассистенту, необходимо войти в аккаунт
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.chatContainer}>
        {/* Шапка */}
        <View style={styles.chatHeader}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.chatTitle, { color: theme.text }]}>
            Задать вопрос
          </Text>
          <View style={styles.headerRight} />
        </View>

        {errorKind ? (
          <View style={styles.centerContent}>
            <MaterialIcons
              name={
                errorKind === "network"
                  ? "wifi-off"
                  : errorKind === "server"
                    ? "cloud-off"
                    : "error-outline"
              }
              size={64}
              color={theme.muted}
            />
            <Text style={[styles.errorText, { color: theme.text }]}>
              {errorMessage}
            </Text>
            <Pressable
              onPress={() => setErrorKind(null)}
              style={[styles.centerBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={[styles.centerBtnText, { color: theme.white }]}>
                Попробовать снова
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {messages.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialIcons
                  name="question-answer"
                  size={48}
                  color={theme.muted}
                />
                <Text style={[styles.emptyText, { color: theme.muted }]}>
                  Спросите о своих покупках,{"\n"}рационе или расходах
                </Text>
              </View>
            )}

            {/* Сообщения */}
            <ScrollView
              ref={scrollRef}
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd()}
              keyboardShouldPersistTaps="handled"
            >
              {messages.map((msg, i) => (
                <View
                  key={i}
                  style={[
                    styles.messageBubble,
                    msg.role === "user"
                      ? [
                          styles.userBubble,
                          { backgroundColor: theme.primaryContainer },
                        ]
                      : [
                          styles.assistantBubble,
                          {
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                          },
                        ],
                  ]}
                >
                  {msg.role === "assistant" ? (
                    <Markdown
                      style={{
                        body: {
                          color: theme.text,
                          fontSize: 15,
                          lineHeight: 21,
                        },
                        bullet: { color: theme.primary },
                        bullet_list: { marginBottom: 8 },
                        code_block: {
                          backgroundColor: theme.surfaceElevated,
                          borderColor: theme.border,
                          borderRadius: 8,
                          borderWidth: 1,
                          color: theme.text,
                          padding: 10,
                        },
                        fence: {
                          backgroundColor: theme.surfaceElevated,
                          borderColor: theme.border,
                          borderRadius: 8,
                          borderWidth: 1,
                          color: theme.text,
                          padding: 10,
                        },
                        heading1: {
                          color: theme.text,
                          fontSize: 20,
                          fontWeight: "700",
                          marginBottom: 8,
                          marginTop: 12,
                        },
                        heading2: {
                          color: theme.text,
                          fontSize: 18,
                          fontWeight: "700",
                          marginBottom: 6,
                          marginTop: 10,
                        },
                        heading3: {
                          color: theme.text,
                          fontSize: 16,
                          fontWeight: "700",
                          marginBottom: 4,
                          marginTop: 8,
                        },
                        link: { color: theme.primary },
                        list_item: { marginBottom: 4 },
                        paragraph: { marginBottom: 8 },
                        strong: { color: theme.text, fontWeight: "700" },
                      }}
                    >
                      {msg.text}
                    </Markdown>
                  ) : (
                    <Text
                      style={[
                        styles.messageText,
                        { color: theme.onPrimaryContainer },
                      ]}
                    >
                      {msg.text}
                    </Text>
                  )}
                  {msg.role === "assistant" && (
                    <Pressable
                      onPress={() => togglePin(i)}
                      style={styles.pinBtn}
                    >
                      <MaterialIcons
                        name={msg.pinned ? "push-pin" : "bookmark-outline"}
                        size={16}
                        color={msg.pinned ? theme.primary : theme.muted}
                      />
                    </Pressable>
                  )}
                </View>
              ))}
              {loading && (
                <View style={styles.loadingBubble}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={[styles.loadingText, { color: theme.muted }]}>
                    Думаю...
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Поле ввода */}
            <Animated.View
              style={[
                styles.inputBar,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <TextInput
                style={[styles.chatInput, { color: theme.text }]}
                value={input}
                onChangeText={setInput}
                placeholder="Напишите вопрос..."
                placeholderTextColor={theme.muted}
                multiline
                maxLength={1000}
                returnKeyType="send"
                onSubmitEditing={() => void sendMessage()}
              />
              <Pressable
                onPress={sendMessage}
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: theme.primary,
                    opacity: loading || !input.trim() ? 0.5 : 1,
                  },
                ]}
                disabled={loading || !input.trim()}
              >
                <MaterialIcons name="send" size={22} color={theme.white} />
              </Pressable>
            </Animated.View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
    padding: 20,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  headerRight: {
    width: 40,
  },
  chatTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  centerTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  centerText: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 22,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingBottom: 12,
  },
  messageBubble: {
    maxWidth: "85%",
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  pinBtn: {
    marginTop: 8,
    alignSelf: "flex-end",
    padding: 4,
  },
  loadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  loadingText: {
    fontSize: 14,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    alignSelf: "center",
    borderRadius: 20,
    borderWidth: 1,
    padding: 8,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: "center",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 15,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  centerBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  centerBtnText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
