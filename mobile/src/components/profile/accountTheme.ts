import type { Theme, ThemeName } from "../../themes";

export type AccountTheme = {
  background: string;
  card: string;
  chip: string;
  muted: string;
  proCard: string;
  text: string;
  accent: string;
  accentText: string;
};

export function getAccountTheme(
  theme: Theme,
  themeName: ThemeName,
): AccountTheme {
  if (themeName === "dark") {
    return {
      background: "#3B3633",
      card: "#4B4541",
      chip: "#625C58",
      muted: "#CFC0A2",
      proCard: "#514B47",
      text: "#F4E9CE",
      accent: "#E34C40",
      accentText: "#FFF8EC",
    };
  }
  return {
    background: "#F3EFE6",
    card: "#FBF7EF",
    chip: "#E8DFCF",
    muted: "#716C66",
    proCard: "#E9DFCE",
    text: "#252421",
    accent: "#E34C40",
    accentText: "#FFF8EC",
  };
}
