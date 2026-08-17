import { act, create } from "react-test-renderer";

import { ReceiptsScreen } from "../ReceiptsScreen";

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      bg: "#fff8ec",
      border: "#e8d8bf",
      muted: "#74776b",
      outline: "#cdbfa9",
      primary: "#d94a36",
      surface: "#fffdf8",
      text: "#213b2d",
    },
  }),
}));
jest.mock("@/analytics/facade", () => ({
  AnalyticsCancelledError: class AnalyticsCancelledError extends Error {},
  analyticsEvents: { receiptCapture: jest.fn() },
}));
jest.mock("@/api/client", () => ({ getReceiptByRawQR: jest.fn() }));
jest.mock("@/storage", () => ({
  normalizeReceiptResponse: jest.fn(),
  saveReceipt: jest.fn(),
}));
jest.mock("expo-image-picker", () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

const baseProps = {
  db: {} as never,
  joinedItems: [],
  onOpenReceiptDetail: jest.fn(),
  onRefresh: jest.fn().mockResolvedValue(undefined),
  receipts: [],
  storeAliases: {},
};

describe("ReceiptsScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    baseProps.onOpenReceiptDetail.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("shows the redesigned empty state and QR upload entry point", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ReceiptsScreen {...baseProps} />);
    });

    expect(
      view!.root.findByProps({ accessibilityLabel: "Загрузить QR" }),
    ).toBeTruthy();
    expect(
      view!.root.findByProps({ accessibilityLabel: "Корзина с продуктами" }),
    ).toBeTruthy();
  });

  it("opens the QR capture sheet", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ReceiptsScreen {...baseProps} />);
    });

    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Загрузить QR" })
        .props.onPress();
    });

    expect(
      view!.root.findByProps({ accessibilityLabel: "Сделать фото" }),
    ).toBeTruthy();
    expect(
      view!.root.findByProps({ accessibilityLabel: "Выбрать фото" }),
    ).toBeTruthy();
  });

  it("opens a receipt row from newest-first local data", async () => {
    const receipt = {
      id: "receipt-1",
      organization: "Перекрёсток",
      operationType: 1,
      qrraw: "manual:1",
      sourceCode: 1,
      ticketDate: "2026-08-17T10:00:00.000Z",
      totalSumRub: 2842,
    };
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(
        <ReceiptsScreen
          {...baseProps}
          receipts={[receipt]}
          joinedItems={[
            {
              receiptId: receipt.id,
              name: "Минеральная вода",
              category: "Напитки",
              priceRub: 100,
              quantity: 1,
              sumRub: 100,
            },
          ]}
        />,
      );
    });

    expect(() => view!.root.findByProps({ children: "Напитки" })).toThrow();

    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Открыть чек Перекрёсток" })
        .props.onPress();
    });

    expect(baseProps.onOpenReceiptDetail).toHaveBeenCalledWith(receipt);
  });
});
