import type { ReactNode } from "react";
import { act, create } from "react-test-renderer";
import { KeyboardAvoidingView, Text, TextInput } from "react-native";

import { StoreNamesSection } from "../StoreNamesSection";

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      border: "#ccc",
      error: "#ef4444",
      muted: "#777",
      outline: "#ddd",
      primary: "#06f",
      surface: "#fff",
      surfaceElevated: "#f7f7f7",
      text: "#111",
      white: "#fff",
    },
  }),
}));
jest.mock("@/components/FullModalWindow", () => ({
  __esModule: true,
  default: ({ children, visible }: { children: ReactNode; visible: boolean }) =>
    visible ? <>{children}</> : null,
}));

describe("StoreNamesSection", () => {
  it("wraps the alias editor in KeyboardAvoidingView", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(
        <StoreNamesSection
          stores={["Delivery Foods"]}
          aliases={{}}
          onSave={jest.fn().mockResolvedValue(undefined)}
          onRestore={jest.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Настроить названия магазинов" })
        .props.onPress();
    });
    await act(async () => {
      view!.root.findByProps({
        accessibilityLabel: "Изменить название Delivery Foods",
      }).props.onPress();
    });

    expect(view!.root.findByType(KeyboardAvoidingView)).toBeTruthy();
    expect(view!.root.findAllByType(TextInput)).toHaveLength(2);
    expect(
      view!.root
        .findAllByType(Text)
        .some((node) => node.props.children === "Показывать как"),
    ).toBe(true);
  });
});
