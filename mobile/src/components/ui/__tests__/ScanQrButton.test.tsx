import { act, create } from "react-test-renderer";

import ScanQrButton from "../ScanQrButton";

const darkTheme = {
  bg: "#282828",
  primary: "#d79921",
  white: "#fbf1c7",
};

jest.mock("@/assets/TomatoOutline.svg", () => () => null);
jest.mock("@/assets/TomatoOutlineLight.png", () => "tomato.png");
jest.mock("../../ThemeContext", () => ({
  useTheme: () => ({ theme: darkTheme, themeName: "dark" }),
}));

describe("ScanQrButton", () => {
  it("uses theme tokens and preserves the press action", async () => {
    const onPress = jest.fn();
    let view: ReturnType<typeof create>;

    await act(async () => {
      view = create(<ScanQrButton onPress={onPress} />);
    });

    const button = view!.root.findByProps({
      accessibilityLabel: "Загрузить QR",
    });
    expect(button.props.style({ pressed: false })[1]).toEqual({
      borderColor: darkTheme.primary,
      backgroundColor: darkTheme.primary,
      opacity: 1,
    });
    expect(
      view!.root.findByProps({ children: "Загрузить QR" }).props.style[1],
    ).toEqual({
      color: darkTheme.white,
    });

    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
