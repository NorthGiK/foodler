import { act, create } from "react-test-renderer";
import * as mockReact from "react";
import { ActivityIndicator, View as MockView } from "react-native";

import type { Receipt, ReceiptItem } from "../../types";
import { ReceiptDetailScreen } from "../ReceiptDetailScreen";

const mockGoBack = jest.fn();
const mockLoadReceiptItems = jest.fn<
  Promise<ReceiptItem[]>,
  [unknown, string]
>();
const mockReceipt: Receipt = {
  id: "receipt-detail",
  organization: "Перекрёсток",
  operationType: 1,
  qrraw: "manual:detail",
  sourceCode: 1,
  ticketDate: "2026-08-17T12:00:00.000Z",
  totalSumRub: 500,
};
const activeViews: ReturnType<typeof create>[] = [];

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@react-navigation/native", () => {
  return {
    useFocusEffect: (callback: () => void) =>
      mockReact.useEffect(() => callback(), [callback]),
    useNavigation: () => ({ goBack: mockGoBack }),
    useRoute: () => ({ params: { receipt: mockReceipt, storeAliases: {} } }),
  };
});
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      bg: "#fff8ec",
      border: "#e8d8bf",
      error: "#c8392b",
      muted: "#74776b",
      outline: "#cdbfa9",
      primary: "#d94a36",
      surface: "#fffdf8",
      text: "#213b2d",
      white: "#ffffff",
    },
  }),
}));
jest.mock("../../api/sync", () => ({
  queueReceiptDeletion: jest.fn(),
  syncPendingReceiptDeletions: jest.fn(),
}));
jest.mock("../../analytics/facade", () => ({
  analyticsEvents: {
    receiptDeleted: jest.fn(),
    receiptDetailViewed: jest.fn(),
  },
}));
jest.mock("../../storage", () => ({
  deleteReceipt: jest.fn(),
  hasLocalCategoryOverride: jest.fn().mockResolvedValue(false),
  loadReceiptItems: (...args: [unknown, string]) =>
    mockLoadReceiptItems(...args),
  openDb: jest.fn().mockResolvedValue({}),
  removeLocalCategoryOverride: jest.fn(),
  saveLocalCategoryOverride: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => {
  return {
    SafeAreaView: (props: mockReact.ComponentProps<typeof MockView>) => (
      <MockView {...props} />
    ),
  };
});

const item = (
  name: string,
  category: string,
  priceRub: number,
  sumRub: number,
): ReceiptItem => ({
  receiptId: mockReceipt.id,
  name,
  category,
  priceRub,
  quantity: 1,
  sumRub,
});

async function renderDetail(items: ReceiptItem[] | Error) {
  if (items instanceof Error) mockLoadReceiptItems.mockRejectedValueOnce(items);
  else mockLoadReceiptItems.mockResolvedValueOnce(items);

  let view: ReturnType<typeof create>;
  await act(async () => {
    view = create(<ReceiptDetailScreen />);
    await Promise.resolve();
    await Promise.resolve();
  });
  activeViews.push(view!);
  return view!;
}

describe("ReceiptDetailScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      for (const view of activeViews.splice(0)) view.unmount();
    });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("renders grouped product lines and normalized category totals", async () => {
    const view = await renderDetail([
      item("Молоко", "молоченые", 100, 100),
      item("молоко", "Молочные продукты", 100, 100),
      item("Яблоко", "фрукты", 150, 150),
      item("Хлеб", "Хлеб и выпечка", 150, 150),
    ]);

    expect(view.root.findByProps({ children: "Состав покупки" })).toBeTruthy();
    expect(
      view.root.findByProps({
        accessibilityLabel: "Изменить категорию товара Молоко",
      }),
    ).toBeTruthy();
    expect(
      view.root.findByProps({ children: "Итоги по категориям" }),
    ).toBeTruthy();
    expect(
      view.root.findByProps({ children: "Молочные продукты" }),
    ).toBeTruthy();
    expect(view.root.findByProps({ children: "Фрукты" })).toBeTruthy();
    expect(view.root.findByProps({ children: "Хлеб и выпечка" })).toBeTruthy();
    expect(view.root.findByProps({ children: "Итого по чеку" })).toBeTruthy();
  });

  it("keeps a loading state before local items resolve", async () => {
    let resolveItems: (items: ReceiptItem[]) => void = () => undefined;
    mockLoadReceiptItems.mockReturnValueOnce(
      new Promise<ReceiptItem[]>((resolve) => {
        resolveItems = resolve;
      }),
    );
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ReceiptDetailScreen />);
    });

    activeViews.push(view!);
    expect(view!.root.findByType(ActivityIndicator)).toBeTruthy();
    await act(async () => resolveItems([]));
  });

  it("keeps an error state and retry action when item loading fails", async () => {
    const view = await renderDetail(new Error("offline"));

    expect(
      view.root.findByProps({ children: "Не удалось загрузить товары" }),
    ).toBeTruthy();
    expect(view.root.findByProps({ children: "Повторить" })).toBeTruthy();
  });

  it("keeps an explicit empty state when the receipt has no products", async () => {
    const view = await renderDetail([]);

    expect(
      view.root.findByProps({ children: "В этом чеке нет товарных позиций." }),
    ).toBeTruthy();
  });
});
