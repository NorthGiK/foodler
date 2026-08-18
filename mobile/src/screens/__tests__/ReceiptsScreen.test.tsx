import { act, create } from "react-test-renderer";
import type { ReactNode } from "react";
import { PermissionStatus } from "expo-modules-core";

import { getReceiptByRawQR } from "../../api/client";
import {
  launchImageLibraryAsync,
  requestMediaLibraryPermissionsAsync,
} from "expo-image-picker";
import { normalizeReceiptResponse, saveReceipt } from "../../storage";
import { ReceiptsScreen } from "../ReceiptsScreen";

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("../../assets/TomatoOutline.svg", () => () => null);
jest.mock(
  "@/components/FullModalWindow",
  () =>
    ({ children, visible }: { children: ReactNode; visible: boolean }) =>
      visible ? children : null,
);
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

const grantedPermission = {
  canAskAgain: true,
  expires: "never" as const,
  granted: true,
  status: PermissionStatus.GRANTED,
};
const selectedImage = {
  height: 100,
  type: "image" as const,
  uri: "file:///receipt.jpg",
  width: 100,
};

describe("ReceiptsScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
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

  it("opens the QR capture sheet for a widget request", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ReceiptsScreen {...baseProps} scanRequestId={1} />);
    });

    expect(
      view!.root.findByProps({ accessibilityLabel: "Сделать фото" }),
    ).toBeTruthy();
  });

  it("shows an inline QR error and keeps the sheet open after an invalid response", async () => {
    jest
      .mocked(requestMediaLibraryPermissionsAsync)
      .mockResolvedValue(grantedPermission);
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [selectedImage],
    });
    jest.mocked(getReceiptByRawQR).mockResolvedValue({ code: 400 });
    jest.mocked(normalizeReceiptResponse).mockReturnValue(null);

    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ReceiptsScreen {...baseProps} />);
    });
    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Загрузить QR" })
        .props.onPress();
    });
    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Выбрать фото" })
        .props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      view!.root.findByProps({ children: "Не удалось распознать QR" }),
    ).toBeTruthy();
    expect(
      view!.root.findByProps({ accessibilityLabel: "Выбрать другое фото" }),
    ).toBeTruthy();
    expect(
      view!.root.findByProps({ accessibilityLabel: "Закрыть" }),
    ).toBeTruthy();
    expect(saveReceipt).not.toHaveBeenCalled();
  });

  it("retries from the same error state, saves a valid receipt, and closes the sheet", async () => {
    const receipt = {
      id: "receipt-qr",
      organization: "Магазин",
      operationType: 1,
      qrraw: "t=20260817T1200",
      sourceCode: 1,
      ticketDate: "2026-08-17T12:00:00.000Z",
      totalSumRub: 420,
    };
    const response = { receipt, items: [] };
    jest
      .mocked(requestMediaLibraryPermissionsAsync)
      .mockResolvedValue(grantedPermission);
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [selectedImage],
    });
    jest.mocked(getReceiptByRawQR).mockResolvedValue({ code: 200 });
    jest
      .mocked(normalizeReceiptResponse)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(response);

    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ReceiptsScreen {...baseProps} />);
    });
    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Загрузить QR" })
        .props.onPress();
    });
    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Выбрать фото" })
        .props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Выбрать другое фото" })
        .props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveReceipt).toHaveBeenCalledWith(baseProps.db, receipt, []);
    expect(() =>
      view!.root.findByProps({ children: "Не удалось распознать QR" }),
    ).toThrow();
  });

  it("closes the QR error sheet without replacing the receipts screen", async () => {
    jest
      .mocked(requestMediaLibraryPermissionsAsync)
      .mockResolvedValue(grantedPermission);
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [selectedImage],
    });
    jest.mocked(getReceiptByRawQR).mockResolvedValue({ code: 400 });
    jest.mocked(normalizeReceiptResponse).mockReturnValue(null);

    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<ReceiptsScreen {...baseProps} />);
    });
    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Загрузить QR" })
        .props.onPress();
    });
    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Выбрать фото" })
        .props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      view!.root.findByProps({ accessibilityLabel: "Закрыть" }).props.onPress();
    });

    expect(
      view!.root.findByProps({ accessibilityLabel: "Загрузить QR" }),
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
