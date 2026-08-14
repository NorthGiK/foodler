import { act, create } from "react-test-renderer";
import { KeyboardAvoidingView, TextInput } from "react-native";

import { ShakeInput } from "../ShakeInput";

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      muted: "#777",
      outline: "#ccc",
      text: "#111",
    },
  }),
}));

describe("ShakeInput", () => {
  it("keeps the visibility toggle at the field edge and toggles secure entry", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(
        <ShakeInput
          label="Пароль"
          value="secret"
          onChangeText={jest.fn()}
          secureTextEntry
        />,
      );
    });

    const inputWrapper = view!.root.findByType(KeyboardAvoidingView);
    expect(inputWrapper.props.style).toEqual({ flex: 1 });
    expect(view!.root.findByType(TextInput).props.secureTextEntry).toBe(true);

    const toggle = view!.root.findAll(
      (node) => node.props.accessibilityLabel === "Показать пароль",
    )[0];
    act(() => {
      toggle.props.onPress();
    });

    expect(view!.root.findByType(TextInput).props.secureTextEntry).toBe(false);
    expect(
      view!.root.findAll(
        (node) => node.props.accessibilityLabel === "Скрыть пароль",
      )[0].props.accessibilityLabel,
    ).toBe("Скрыть пароль");
  });
});
