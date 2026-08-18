import { act, create } from "react-test-renderer";
import { StatsScreen } from "../StatsScreen";

const mockTheme = {
  bg: "#FFF8EC",
  surface: "#FFFDF8",
  surfaceElevated: "#F8EEDC",
  border: "#E8D8BF",
  text: "#213B2D",
  muted: "#74776B",
  primary: "#D94A36",
  primaryContainer: "#F9DDD4",
  onPrimaryContainer: "#8D2B1E",
  secondary: "#315E45",
  error: "#C8392B",
  danger: "#C8392B",
  outline: "#CDBFA9",
  shadow: "#473D31",
  white: "#FFFFFF",
};

jest.mock("../../components/ThemeContext", () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

jest.mock("react-native-gifted-charts", () => ({
  BarChart: () => null,
  PieChart: () => null,
}));

describe("StatsScreen", () => {
  it("shows the empty state and routes the QR action to the receipt flow", () => {
    const onUploadReceipt = jest.fn();
    let view: ReturnType<typeof create>;

    act(() => {
      view = create(
        <StatsScreen
          receipts={[]}
          joinedItems={[]}
          onUploadReceipt={onUploadReceipt}
        />,
      );
    });

    expect(view!.root.findByProps({ children: "Статистика" })).toBeTruthy();
    expect(
      view!.root.findByProps({ children: "Статистика появится здесь" }),
    ).toBeTruthy();

    act(() => {
      view!.root
        .findByProps({ accessibilityLabel: "Загрузить QR" })
        .props.onPress();
    });

    expect(onUploadReceipt).toHaveBeenCalledTimes(1);
  });
});
