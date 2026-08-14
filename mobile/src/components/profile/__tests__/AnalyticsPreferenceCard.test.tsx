import { act, create } from "react-test-renderer";
import { Switch, Text } from "react-native";

import { analytics } from "@/analytics/service";

import { AnalyticsPreferenceCard } from "../AnalyticsPreferenceCard";

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@/analytics/service", () => ({
  analytics: {
    preferenceState: jest.fn(),
    setPreference: jest.fn(),
  },
}));
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      border: "#ccc",
      muted: "#777",
      primary: "#06f",
      surface: "#fff",
      text: "#111",
    },
  }),
}));

const enabledState = {
  consent: true,
  enabled: true,
  pendingPreference: null,
  accountEnabled: null,
};

describe("AnalyticsPreferenceCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(analytics.preferenceState).mockResolvedValue(enabledState);
    jest.mocked(analytics.setPreference).mockResolvedValue("synced");
  });

  it("renders the resolved preference for a guest", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<AnalyticsPreferenceCard />);
    });

    expect(view!.root.findByType(Switch).props.value).toBe(true);
    expect(analytics.preferenceState).toHaveBeenCalledTimes(1);
  });

  it("applies disable locally and exposes the pending-offline state", async () => {
    jest.mocked(analytics.setPreference).mockResolvedValueOnce("pending");
    jest.mocked(analytics.preferenceState).mockResolvedValueOnce(enabledState);

    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<AnalyticsPreferenceCard />);
    });
    await act(async () => {
      view!.root.findByType(Switch).props.onValueChange(false);
    });

    const toggle = view!.root.findByType(Switch);
    expect(toggle.props.value).toBe(false);
    expect(toggle.props.disabled).toBe(true);
    expect(analytics.setPreference).toHaveBeenCalledWith(false);
    expect(
      view!.root
        .findAllByType(Text)
        .some((node) => String(node.props.children).includes("подключении")),
    ).toBe(true);
  });

  it("keeps opt-in off until synchronization succeeds", async () => {
    jest
      .mocked(analytics.preferenceState)
      .mockResolvedValueOnce({ ...enabledState, enabled: false })
      .mockResolvedValueOnce(enabledState);
    let resolvePreference: ((value: "synced") => void) | undefined;
    jest.mocked(analytics.setPreference).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePreference = resolve;
        }),
    );

    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(<AnalyticsPreferenceCard />);
    });

    act(() => {
      view!.root.findByType(Switch).props.onValueChange(true);
    });
    expect(view!.root.findAllByType(Switch)).toHaveLength(0);
    await act(async () => {
      resolvePreference?.("synced");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view!.root.findByType(Switch).props.value).toBe(true);
  });
});
