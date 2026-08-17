import { act, create } from "react-test-renderer";
import type { ReactElement } from "react";

import { ReportCard } from "../ReportCard";

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("../../ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      border: "#e8d8bf",
      muted: "#74776b",
      primary: "#d94a36",
      surface: "#fffdf8",
      text: "#213b2d",
    },
  }),
}));

describe("ReportCard", () => {
  it("renders the report title and date", async () => {
    const view = await renderCard(
      <ReportCard
        action="analysis"
        date="вчера"
        onPress={jest.fn()}
        title="Разбор покупок"
      />,
    );

    expect(view.root.findByProps({ children: "Разбор покупок" })).toBeTruthy();
    expect(view.root.findByProps({ children: "вчера" })).toBeTruthy();
  });

  it.each([
    [true, "Закреплено"],
    [false, "Не закреплено"],
  ])("shows the %s pin state inline", async (pinned, label) => {
    const view = await renderCard(
      <ReportCard
        action="recipe"
        date="сегодня"
        onPress={jest.fn()}
        pinned={pinned}
        title="Идеи для ужина"
      />,
    );

    expect(view.root.findByProps({ accessibilityLabel: label })).toBeTruthy();
  });

  it("calls onPress for the whole report row", async () => {
    const onPress = jest.fn();
    const view = await renderCard(
      <ReportCard
        action="save_money"
        date="сегодня"
        onPress={onPress}
        title="Экономия"
      />,
    );

    view.root
      .findByProps({ accessibilityLabel: "Отчёт: Экономия" })
      .props.onPress();

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

async function renderCard(element: ReactElement) {
  let view: ReturnType<typeof create> | undefined;
  await act(async () => {
    view = create(element);
  });
  return view!;
}
