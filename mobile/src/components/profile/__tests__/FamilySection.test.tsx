import type { ReactNode } from "react";
import { act, create } from "react-test-renderer";

import { FamilySection } from "../FamilySection";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      border: "#ccc",
      error: "#c00",
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
jest.mock("@/components/FullModalWindow", () => ({
  __esModule: true,
  default: ({
    children,
    visible,
  }: {
    children: ReactNode;
    visible: boolean;
  }) => (visible ? <>{children}</> : null),
}));
jest.mock("../../ui", () => ({
  AddButton: ({ title, onPress }: { title: string; onPress: () => void }) => {
    const mockReact = jest.requireActual<typeof import("react")>("react");
    const mockNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return mockReact.createElement(
      mockNative.Pressable,
      { onPress },
      mockReact.createElement(mockNative.Text, null, title),
    );
  },
  CashFormInput: ({
    label,
    value,
    onChangeText,
    error,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    error?: string;
  }) =>
    (() => {
      const mockReact = jest.requireActual<typeof import("react")>("react");
      const mockNative =
        jest.requireActual<typeof import("react-native")>("react-native");
      return mockReact.createElement(
        mockNative.View,
        null,
        mockReact.createElement(mockNative.Text, null, label),
        mockReact.createElement(mockNative.TextInput, { value, onChangeText }),
        error ? mockReact.createElement(mockNative.Text, null, error) : null,
      );
    })(),
  CashFormSection: ({ children }: { children: ReactNode }) => {
    const mockReact = jest.requireActual<typeof import("react")>("react");
    const mockNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return mockReact.createElement(mockNative.View, null, children);
  },
  FamilyMemberCard: () => null,
}));

const profile = { familyMembers: [] } as never;

describe("FamilySection", () => {
  it("opens the add member screen", async () => {
    let view: ReturnType<typeof create>;

    await act(async () => {
      view = create(
        <FamilySection profile={profile} onRemoveMember={jest.fn()} />,
      );
    });

    await act(async () => {
      view!.root
        .findByProps({
          accessibilityLabel: "Добавить члена семьи",
        })
        .props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("FamilyMember", {});
  });
});
