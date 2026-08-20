import { act, create } from "react-test-renderer";
import React from "react";
import { ScrollView, Text } from "react-native";

import { ProfileScreen } from "../ProfileScreen";

const mockUseEffect = React.useEffect;

const mockNavigate = jest.fn();
const mockAuth = {
  isAuthenticated: false,
  logout: jest.fn(),
  refreshUser: jest.fn(),
  user: null as {
    analyticsEnabled: boolean;
    email: string;
    premium: boolean;
  } | null,
};

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (callback: () => void) => mockUseEffect(callback, [callback]),
}));
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      bg: "#fff",
      border: "#ddd",
      error: "#c00",
      muted: "#777",
      onPrimaryContainer: "#531",
      primary: "#d43",
      primaryContainer: "#fee",
      secondary: "#253",
      surface: "#fff",
      text: "#222",
      white: "#fff",
    },
  }),
}));
jest.mock("@/api/auth", () => ({ useAuth: () => mockAuth }));
jest.mock("@/api/client", () => ({ api: { sendFeedback: jest.fn() } }));
jest.mock("@/analytics/facade", () => ({
  analyticsEvents: { feedbackSubmitted: jest.fn() },
}));
jest.mock("@/profileStorage", () => ({
  loadProfile: jest.fn().mockResolvedValue({ familyMembers: [] }),
  saveProfile: jest.fn(),
}));
jest.mock("@/components/profile", () => ({
  AiCreditsCard: () => null,
  AnalyticsPreferenceCard: () => null,
  ConfirmModal: () => null,
  FamilySection: () => null,
  FeedbackSection: () => null,
  ProfileInfoCard: () => null,
  StoreNamesSection: () => null,
  SubscriptionButton: () => null,
}));

const props = {
  stores: [],
  storeAliases: {},
  onRestoreStoreAlias: jest.fn(),
  onSaveStoreAlias: jest.fn(),
};

describe("ProfileScreen menu", () => {
  beforeEach(() => {
    mockAuth.isAuthenticated = false;
    mockAuth.user = null;
    mockNavigate.mockClear();
  });

  it("shows only guest-available profile menu items", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ProfileScreen {...props} />);
    });

    expect(
      view!.root.findByProps({ accessibilityLabel: "Настройки чеков" }),
    ).toBeTruthy();
    expect(
      view!.root.findByProps({ accessibilityLabel: "Обратная связь" }),
    ).toBeTruthy();
    expect(() =>
      view!.root.findByProps({ accessibilityLabel: "Аккаунт" }),
    ).toThrow();
    view!.root
      .findByProps({ accessibilityLabel: "Войти в аккаунт" })
      .props.onPress();
    expect(mockNavigate).toHaveBeenCalledWith("Login");
  });

  it("opens the account menu for an authenticated user", async () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = {
      analyticsEnabled: true,
      email: "person@example.com",
      premium: false,
    };
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ProfileScreen {...props} />);
    });

    await act(async () => {
      view!.root.findByProps({ accessibilityLabel: "Аккаунт" }).props.onPress();
    });
    expect(
      view!.root.findByProps({ accessibilityLabel: "Назад к профилю" }),
    ).toBeTruthy();
    expect(
      view!.root
        .findAllByType(Text)
        .filter((node) => node.props.children === "Аккаунт"),
    ).toHaveLength(0);
    expect(
      view!.root.findByType(ScrollView).props.keyboardShouldPersistTaps,
    ).toBe("handled");
  });
});
