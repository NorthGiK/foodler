import { createNavigationTheme } from "../navigationTheme";
import { themes } from "../themes";

describe("createNavigationTheme", () => {
  it("uses the active dark theme as the navigation transition background", () => {
    const navigationTheme = createNavigationTheme(themes.dark, "dark");

    expect(navigationTheme.dark).toBe(true);
    expect(navigationTheme.colors.background).toBe(themes.dark.bg);
    expect(navigationTheme.colors.card).toBe(themes.dark.surface);
  });
});
