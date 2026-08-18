import { act, create } from "react-test-renderer";
import { Text, TextInput } from "react-native";

import { api } from "../../api/client";
import { ForgotPasswordScreen } from "../ForgotPasswordScreen";

const mockGoBack = jest.fn();

jest.mock("../../api/client", () => ({
  api: {
    forgotPasswordSendCode: jest.fn(),
    forgotPasswordConfirmCode: jest.fn(),
    forgotPasswordReset: jest.fn(),
  },
}));
jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));
jest.mock("../../components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      bg: "#fff",
      muted: "#777",
      primary: "#d94a36",
      surface: "#fff",
      border: "#ddd",
      text: "#111",
      white: "#fff",
    },
  }),
}));

describe("ForgotPasswordScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(api.forgotPasswordSendCode)
      .mockResolvedValue({ message: "ok" });
    jest.mocked(api.forgotPasswordConfirmCode).mockResolvedValue({
      resetToken: "reset-token",
    });
    jest.mocked(api.forgotPasswordReset).mockResolvedValue({ message: "ok" });
  });

  it("confirms the code separately and uses the reset token for the password", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ForgotPasswordScreen />);
    });

    const inputs = () => view!.root.findAllByType(TextInput);
    const buttons = () =>
      view!.root.findAll((node) => typeof node.props?.onPress === "function");
    const pressSubmit = (label: string) => {
      const button = buttons().find((candidate) =>
        candidate
          .findAllByType(Text)
          .some((text) => text.props.children === label),
      );
      if (!button) throw new Error(`Submit button not found: ${label}`);
      button.props.onPress();
    };

    await act(async () => {
      inputs()[0].props.onChangeText("user@example.com");
    });
    await act(async () => {
      pressSubmit("Отправить код");
    });
    expect(api.forgotPasswordSendCode).toHaveBeenCalledWith("user@example.com");

    await act(async () => {
      inputs()[0].props.onChangeText("12345678");
    });
    await act(async () => {
      pressSubmit("Подтвердить");
    });
    expect(api.forgotPasswordConfirmCode).toHaveBeenCalledWith(
      "user@example.com",
      "12345678",
    );

    await act(async () => {
      inputs()[0].props.onChangeText("NewPass123!");
      inputs()[1].props.onChangeText("NewPass123!");
    });
    await act(async () => {
      pressSubmit("Изменить пароль");
    });
    expect(api.forgotPasswordReset).toHaveBeenCalledWith(
      "reset-token",
      "NewPass123!",
    );
  });

  it("does not send malformed confirmation codes", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ForgotPasswordScreen />);
    });
    const inputs = () => view!.root.findAllByType(TextInput);
    const buttons = () =>
      view!.root.findAll((node) => typeof node.props?.onPress === "function");
    const pressSubmit = (label: string) => {
      const button = buttons().find((candidate) =>
        candidate
          .findAllByType(Text)
          .some((text) => text.props.children === label),
      );
      if (!button) throw new Error("Submit button not found");
      button.props.onPress();
    };

    await act(async () => {
      inputs()[0].props.onChangeText("user@example.com");
    });
    await act(async () => {
      pressSubmit("Отправить код");
    });
    await act(async () => {
      inputs()[0].props.onChangeText("12");
    });
    await act(async () => {
      pressSubmit("Подтвердить");
    });

    expect(api.forgotPasswordConfirmCode).not.toHaveBeenCalled();
  });
});
