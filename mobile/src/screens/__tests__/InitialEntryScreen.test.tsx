import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, create } from "react-test-renderer";

import { InitialEntryScreen } from "../InitialEntryScreen";

const mockReplace = jest.fn();

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ replace: mockReplace }),
}));
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      bg: "#fff8ec",
      muted: "#74776b",
      outline: "#cdbfa9",
      primary: "#d94a36",
      secondary: "#315e45",
      surfaceElevated: "#f8eedc",
      text: "#213b2d",
      white: "#fff",
      border: "#e8d8bf",
    },
  }),
}));

describe("InitialEntryScreen", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    jest.mocked(AsyncStorage.setItem).mockClear();
  });

  it("requires every document before offering the account choice", async () => {
    const onPoliciesAccepted = jest.fn().mockResolvedValue(undefined);
    let view: ReturnType<typeof create>;

    await act(async () => {
      view = create(
        <InitialEntryScreen onPoliciesAccepted={onPoliciesAccepted} />,
      );
    });

    expect(
      view!.root.findByProps({ accessibilityLabel: "Принять и продолжить" })
        .props.disabled,
    ).toBe(true);

    for (const label of [
      "Пользовательское соглашение",
      "Политика конфиденциальности",
      "Согласие на обработку персональных данных",
      "Важная информация об обработке данных",
    ]) {
      await act(async () => {
        view!.root.findByProps({ accessibilityLabel: label }).props.onPress();
      });
    }

    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Принять и продолжить" })
        .props.onPress();
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "@policies_accepted",
      "true",
    );
    expect(onPoliciesAccepted).toHaveBeenCalledTimes(1);
    expect(
      view!.root.findByProps({ accessibilityLabel: "Войти" }),
    ).toBeTruthy();
    expect(
      view!.root.findByProps({ accessibilityLabel: "Продолжить без аккаунта" }),
    ).toBeTruthy();
  });

  it("opens the normal login flow from the account choice", async () => {
    const onPoliciesAccepted = jest.fn().mockResolvedValue(undefined);
    let view: ReturnType<typeof create>;

    await act(async () => {
      view = create(
        <InitialEntryScreen onPoliciesAccepted={onPoliciesAccepted} />,
      );
    });
    for (const label of [
      "Пользовательское соглашение",
      "Политика конфиденциальности",
      "Согласие на обработку персональных данных",
      "Важная информация об обработке данных",
    ]) {
      await act(async () => {
        view!.root.findByProps({ accessibilityLabel: label }).props.onPress();
      });
    }
    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Принять и продолжить" })
        .props.onPress();
    });
    await act(async () => {
      view!.root.findByProps({ accessibilityLabel: "Войти" }).props.onPress();
    });

    expect(mockReplace).toHaveBeenCalledWith("Login", { initialEntry: true });
  });
});
