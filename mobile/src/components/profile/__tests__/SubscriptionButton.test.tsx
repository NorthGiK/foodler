import { act, create } from "react-test-renderer";

import { SubscriptionButton } from "../SubscriptionButton";

const mockNavigate = jest.fn();
const mockAuth = { isAuthenticated: true };

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock("@/api/auth", () => ({
  useAuth: () => mockAuth,
}));
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      onPrimaryContainer: "#531",
      primary: "#06f",
      primaryContainer: "#eef",
      white: "#fff",
    },
  }),
}));

describe("SubscriptionButton", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockAuth.isAuthenticated = true;
  });

  it("opens the subscription screen for an authenticated user", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<SubscriptionButton />);
    });

    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Открыть подписку" })
        .props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("Subscription");
  });

  it("opens login for a guest", async () => {
    mockAuth.isAuthenticated = false;
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<SubscriptionButton />);
    });

    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Открыть подписку" })
        .props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("Login");
  });
});
