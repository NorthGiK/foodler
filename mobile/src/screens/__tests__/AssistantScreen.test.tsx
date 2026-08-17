import { act, create } from "react-test-renderer";

import { AssistantScreen } from "../AssistantScreen";

const mockNavigate = jest.fn();
const mockAiScreenViewed = jest.fn().mockResolvedValue(undefined);

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock("@/api/auth", () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));
jest.mock("@/analytics/facade", () => ({
  analyticsEvents: {
    aiScreenViewed: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      bg: "#fff8ec",
      border: "#e8d8bf",
      error: "#c8392b",
      muted: "#74776b",
      outline: "#cdbfa9",
      primary: "#d94a36",
      text: "#213b2d",
      white: "#fff",
    },
  }),
}));
jest.mock("../../components/animations", () => ({
  FadeInView: ({ children }: { children: React.ReactNode }) => children,
  useStaggeredFadeIn: (count: number) =>
    Array.from({ length: count }, () => ({})),
}));
jest.mock("../../components/ui", () => ({
  ReportCard: () => null,
}));
jest.mock("../../components/AiResultView", () => ({
  AiResultView: () => null,
}));
jest.mock("../../ai/storage", () => ({
  deleteAiReport: jest.fn(),
  initAiReportsTable: jest.fn(),
  loadAiReports: jest.fn().mockResolvedValue([]),
  saveAiReport: jest.fn(),
  togglePinReport: jest.fn(),
}));

describe("AssistantScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockAiScreenViewed.mockClear();
  });

  async function renderScreen() {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(
        <AssistantScreen db={null} receipts={[]} joinedItems={[]} />,
      );
    });
    return view!;
  }

  it("renders the editorial AI menu with four primary actions", async () => {
    const view = await renderScreen();

    expect(view.root.findByProps({ children: "FOODLER" })).toBeTruthy();
    expect(view.root.findByProps({ children: "Foodler AI" })).toBeTruthy();
    for (const title of [
      "Общий анализ",
      "Полезнее",
      "Сэкономить",
      "Список покупок",
      "Что приготовить",
    ]) {
      expect(view.root.findByProps({ accessibilityLabel: title })).toBeTruthy();
    }
    expect(
      view.root.findAllByProps({ accessibilityLabel: "Оценить покупки" }),
    ).toHaveLength(0);
  });

  it("opens the login sheet for a guest and closes it without navigation", async () => {
    const view = await renderScreen();

    await act(async () => {
      view.root
        .findByProps({ accessibilityLabel: "Общий анализ" })
        .props.onPress();
    });

    expect(
      view.root.findByProps({ accessibilityLabel: "AI доступен после входа" }),
    ).toBeTruthy();
    expect(view.root.findByProps({ accessibilityLabel: "Войти" })).toBeTruthy();

    await act(async () => {
      view.root
        .findByProps({ accessibilityLabel: "Продолжить без аккаунта" })
        .props.onPress();
    });

    expect(
      view.root.findAllByProps({ accessibilityLabel: "Войти" }),
    ).toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("opens the existing Login route from the auth sheet", async () => {
    const view = await renderScreen();

    await act(async () => {
      view.root
        .findByProps({ accessibilityLabel: "Сэкономить" })
        .props.onPress();
    });
    await act(async () => {
      view.root.findByProps({ accessibilityLabel: "Войти" }).props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("Login");
  });

  it("reveals secondary AI actions without removing the primary menu", async () => {
    const view = await renderScreen();

    await act(async () => {
      view.root
        .findByProps({ accessibilityLabel: "Ещё AI-действия" })
        .props.onPress();
    });

    expect(
      view.root.findByProps({ accessibilityLabel: "Оценить покупки" }),
    ).toBeTruthy();
    expect(
      view.root.findByProps({ accessibilityLabel: "Задать вопрос" }),
    ).toBeTruthy();
    expect(
      view.root.findByProps({ accessibilityLabel: "Полезнее" }),
    ).toBeTruthy();
  });
});
