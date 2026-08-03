import React from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import MaterialIcons from "@react-native-vector-icons/material-icons";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../ThemeContext";
import { AnimatedPressable } from "../animations";

const MAX_FEEDBACK_IMAGES = 10;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

interface FeedbackSectionProps {
  userEmail?: string;
  onSendFeedback: (
    email: string,
    text: string,
    images: string[],
  ) => Promise<void>;
}

export function FeedbackSection({
  userEmail,
  onSendFeedback,
}: FeedbackSectionProps) {
  const { theme } = useTheme();
  const [feedbackText, setFeedbackText] = React.useState("");
  const [feedbackImages, setFeedbackImages] = React.useState<string[]>([]);
  const [feedbackSending, setFeedbackSending] = React.useState(false);

  const pickFeedbackImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_FEEDBACK_IMAGES - feedbackImages.length,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled) return;

    const newImages: string[] = [];
    for (const asset of result.assets) {
      if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE_BYTES) {
        Alert.alert(
          "Файл слишком большой",
          `${asset.fileName || "Фото"} превышает ${MAX_IMAGE_SIZE_MB} MB`,
        );
        continue;
      }
      if (asset.base64) {
        newImages.push(asset.base64);
      }
    }

    setFeedbackImages((prev) => {
      const combined = [...prev, ...newImages];
      return combined.slice(0, MAX_FEEDBACK_IMAGES);
    });
  };

  const removeFeedbackImage = (index: number) => {
    setFeedbackImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!feedbackText.trim()) {
      Alert.alert("Ошибка", "Напишите текст сообщения");
      return;
    }

    setFeedbackSending(true);
    try {
      if (!userEmail) {
        Alert.alert("Нужна авторизация", "Войдите, чтобы отправить сообщение.");
        return;
      }
      await onSendFeedback(userEmail, feedbackText.trim(), feedbackImages);
      Alert.alert("Отправлено", "Спасибо за обратную связь!");
      setFeedbackText("");
      setFeedbackImages([]);
    } catch (error: unknown) {
      Alert.alert(
        "Ошибка",
        error instanceof Error
          ? error.message
          : "Не удалось отправить сообщение",
      );
    } finally {
      setFeedbackSending(false);
    }
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Обратная связь
        </Text>
      </View>
      <TextInput
        style={[
          styles.feedbackInput,
          {
            color: theme.text,
            borderColor: theme.outline,
            backgroundColor: theme.surfaceElevated,
          },
        ]}
        value={feedbackText}
        onChangeText={setFeedbackText}
        placeholder="Напишите ваше сообщение..."
        placeholderTextColor={theme.muted}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
      <View style={styles.feedbackImagesRow}>
        {feedbackImages.map((img, i) => (
          <View key={i} style={styles.feedbackImageWrapper}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${img}` }}
              style={styles.feedbackImage}
            />
            <Pressable
              style={styles.feedbackImageRemove}
              onPress={() => removeFeedbackImage(i)}
            >
              <MaterialIcons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {feedbackImages.length < MAX_FEEDBACK_IMAGES && (
          <Pressable
            style={[styles.feedbackAddImage, { borderColor: theme.outline }]}
            onPress={pickFeedbackImages}
          >
            <MaterialIcons
              name="add-photo-alternate"
              size={24}
              color={theme.primary}
            />
          </Pressable>
        )}
      </View>
      <AnimatedPressable
        scaleTo={0.97}
        onPress={handleSend}
        disabled={feedbackSending}
      >
        <View
          style={[
            styles.feedbackSendButton,
            {
              backgroundColor: theme.primary,
              opacity: feedbackSending ? 0.6 : 1,
            },
          ]}
        >
          {feedbackSending ? (
            <ActivityIndicator color={theme.white} />
          ) : (
            <Text style={[styles.feedbackSendText, { color: theme.white }]}>
              Отправить
            </Text>
          )}
        </View>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  feedbackInput: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 100,
    width: "100%",
    marginBottom: 12,
  },
  feedbackImagesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
    width: "100%",
  },
  feedbackImageWrapper: {
    position: "relative",
  },
  feedbackImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  feedbackImageRemove: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  feedbackAddImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  feedbackSendButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
  },
  feedbackSendText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
