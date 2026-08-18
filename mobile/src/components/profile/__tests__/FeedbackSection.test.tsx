import { act, create } from "react-test-renderer";
import { Alert, TextInput } from "react-native";

import { FeedbackSection } from "../FeedbackSection";

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@/components/ui/LogoBrand", () => () => null);
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      border: "#ccc",
      muted: "#777",
      onPrimaryContainer: "#531",
      outline: "#ddd",
      primary: "#06f",
      primaryContainer: "#eef",
      secondary: "#253",
      surface: "#fff",
      surfaceElevated: "#f7f7f7",
      text: "#111",
      white: "#fff",
    },
  }),
}));

describe("FeedbackSection", () => {
  it("requires message text before sending", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const onSendFeedback = jest.fn().mockResolvedValue(undefined);
    let view: ReturnType<typeof create>;

    await act(async () => {
      view = create(
        <FeedbackSection
          userEmail="person@example.com"
          onSendFeedback={onSendFeedback}
        />,
      );
    });

    expect(view!.root.findByType(TextInput).props.accessibilityLabel).toBe(
      "Текст обратной связи",
    );
    const send = view!.root.findByProps({
      accessibilityLabel: "Отправить обратную связь",
    });
    await act(async () => {
      send?.props.onPress?.();
    });

    expect(onSendFeedback).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("Ошибка", "Напишите текст сообщения");
    alert.mockRestore();
  });
});
