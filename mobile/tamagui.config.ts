import { config } from "@tamagui/config";
import { createTamagui } from "tamagui";

const customConfig = {
  ...config,
  themes: {
    ...config.themes,
    primary: {
      background: "#6366F1",
      backgroundHover: "#4F46E5",
      backgroundPress: "#4338CA",
      backgroundFocus: "#4F46E5",
    },
  },
};

export default createTamagui(customConfig);
