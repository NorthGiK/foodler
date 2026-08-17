import React, { type ReactNode } from "react";
import { Share, Text } from "react-native";
import { act, create } from "react-test-renderer";

import type { AiReport } from "../../ai/types";
import { AiResultView } from "../AiResultView";

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("../ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      accent: "#587448",
      accent2: "#e7a43a",
      bg: "#fff8ec",
      border: "#e8d8bf",
      error: "#c8392b",
      muted: "#74776b",
      primary: "#d94a36",
      secondary: "#315e45",
      surface: "#fffdf8",
      text: "#213b2d",
      white: "#fff",
    },
  }),
}));

const report: AiReport = {
  action: "analysis",
  createdAt: new Date("2026-08-17T12:30:00.000Z").getTime(),
  id: "report-1",
  pinned: false,
  response: {
    id: "result-1",
    sections: [
      { text: "Покупки в целом сбалансированы.", title: "Вывод", type: "text" },
      { max: 100, title: "Баланс", type: "score", value: 82 },
      {
        items: ["Больше сезонных овощей", "Меньше спонтанных покупок"],
        title: "Шаги",
        type: "list",
      },
      {
        products: [
          { name: "Овсянка", price: 120, reason: "Для быстрых завтраков" },
        ],
        title: "Рекомендованные продукты",
        type: "products",
      },
      {
        kind: "bar",
        labels: ["июнь", "июль"],
        title: "Расходы",
        type: "chart",
        values: [1200, 980],
      },
    ],
    summary: "Небольшие изменения помогут тратить спокойнее.",
    title: "Итоги месяца",
    type: "analysis",
  },
  snapshot: {
    periodFrom: "1 августа",
    periodTo: "17 августа",
    receiptCount: 4,
    receiptIds: ["receipt-1"],
    totalSpent: 3450,
  },
};

describe("AiResultView", () => {
  let shareSpy: jest.SpyInstance;

  beforeEach(() => {
    shareSpy = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction" } as never);
  });

  afterEach(() => {
    shareSpy.mockRestore();
  });

  it("renders loading and empty/error states", async () => {
    const loadingView = await renderView(
      <AiResultView
        loading
        onBack={jest.fn()}
        onDelete={jest.fn()}
        onPin={jest.fn()}
        report={null}
      />,
    );
    expect(
      loadingView.root.findByProps({ children: "Анализируем ваши покупки..." }),
    ).toBeTruthy();

    const onBack = jest.fn();
    const emptyView = await renderView(
      <AiResultView
        loading={false}
        onBack={onBack}
        onDelete={jest.fn()}
        onPin={jest.fn()}
        report={null}
      />,
    );
    expect(
      emptyView.root.findByProps({ children: "Не удалось загрузить отчёт" }),
    ).toBeTruthy();
    emptyView.root
      .findByProps({ accessibilityLabel: "Вернуться к отчётам" })
      .props.onPress();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders the receipt snapshot, summary, and every AI section type", async () => {
    const view = await renderView(
      <AiResultView
        loading={false}
        onBack={jest.fn()}
        onDelete={jest.fn()}
        onPin={jest.fn()}
        report={report}
      />,
    );
    const text = view.root
      .findAllByType(Text)
      .map((node) => stringify(node.props.children))
      .join(" ");

    expect(text).toContain("Итоги месяца");
    expect(text).toContain("СНИМОК ДАННЫХ");
    expect(text).toContain("4");
    expect(text).toContain("3450 ₽");
    expect(text).toContain("Небольшие изменения помогут тратить спокойнее.");
    expect(text).toContain("Вывод");
    expect(text).toContain("Баланс");
    expect(text).toContain("Шаги");
    expect(text).toContain("Рекомендованные продукты");
    expect(text).toContain("Расходы");
    expect(text).toContain("Овсянка");
  });

  it("keeps pin, share, and delete callbacks in the header and action list", async () => {
    const onDelete = jest.fn();
    const onPin = jest.fn();
    const view = await renderView(
      <AiResultView
        loading={false}
        onBack={jest.fn()}
        onDelete={onDelete}
        onPin={onPin}
        report={report}
      />,
    );

    view.root
      .findByProps({ accessibilityLabel: "Закрепить отчёт" })
      .props.onPress();
    view.root
      .findByProps({ accessibilityLabel: "Сохранить отчёт" })
      .props.onPress();
    view.root
      .findByProps({ accessibilityLabel: "Удалить отчёт" })
      .props.onPress();
    view.root
      .findByProps({ accessibilityLabel: "Удалить отчёт из действий" })
      .props.onPress();

    await act(async () => {
      view.root
        .findByProps({ accessibilityLabel: "Поделиться отчётом" })
        .props.onPress();
      await Promise.resolve();
    });

    expect(onPin).toHaveBeenNthCalledWith(1, "report-1", true);
    expect(onPin).toHaveBeenNthCalledWith(2, "report-1", true);
    expect(onDelete).toHaveBeenNthCalledWith(1, "report-1");
    expect(onDelete).toHaveBeenNthCalledWith(2, "report-1");
    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Итоги месяца" }),
    );
    expect(
      view.root.findByProps({ accessibilityLabel: "Сохранить отчёт" }),
    ).toBeTruthy();
    expect(
      view.root.findByProps({ accessibilityLabel: "Поделиться отчётом" }),
    ).toBeTruthy();
    expect(
      view.root.findByProps({
        accessibilityLabel: "Удалить отчёт из действий",
      }),
    ).toBeTruthy();
  });
});

async function renderView(element: React.ReactElement) {
  let view: ReturnType<typeof create> | undefined;
  await act(async () => {
    view = create(element);
  });
  return view!;
}

function stringify(value: ReactNode): string {
  if (Array.isArray(value)) return value.map(stringify).join("");
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }
  return String(value);
}
