import AsyncStorage from "@react-native-async-storage/async-storage";

import { api } from "@/api/client";
import { myTracker } from "../myTracker";
import { AnalyticsService } from "../service";

jest.mock("@/api/client", () => ({
  api: { setAnalyticsIdentityPreference: jest.fn() },
}));
jest.mock("../myTracker", () => ({
  myTracker: {
    flush: jest.fn(),
    setCustomUserId: jest.fn(),
    start: jest.fn(),
    stopIdentity: jest.fn(),
    trackEvent: jest.fn(),
  },
}));

describe("AnalyticsService", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });
  it("does not start an authenticated opt-in until the backend confirms it", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    await service.applyAccountPreference(true, "external-id");
    jest
      .mocked(api.setAnalyticsIdentityPreference)
      .mockRejectedValueOnce(new Error("offline"));
    await expect(service.setPreference(true)).resolves.toBe("pending");
    expect(myTracker.stopIdentity).toHaveBeenCalled();
  });
  it("clears the custom identity immediately for an offline opt-out", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    await service.applyAccountPreference(true, "external-id");
    jest
      .mocked(api.setAnalyticsIdentityPreference)
      .mockRejectedValueOnce(new Error("offline"));
    await service.setPreference(false);
    expect(myTracker.stopIdentity).toHaveBeenCalled();
  });

  it("keeps consented events running in guest, authenticated, and anonymous modes", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);

    await service.track("app_opened", {});
    expect(myTracker.trackEvent).toHaveBeenLastCalledWith("app_opened", {
      identityMode: "guest",
    });

    await service.applyAccountPreference(true, "external-id");
    await service.track("app_opened", {});
    expect(myTracker.trackEvent).toHaveBeenLastCalledWith("app_opened", {
      identityMode: "authenticated",
    });

    await service.applyAccountPreference(false, null);
    await service.track("app_opened", {});
    expect(myTracker.trackEvent).toHaveBeenLastCalledWith("app_opened", {
      identityMode: "anonymous",
    });
  });

  it("clears the account identity on logout without stopping consented tracking", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    await service.applyAccountPreference(true, "external-id");

    await service.clearAccount();

    expect(myTracker.stopIdentity).toHaveBeenCalled();
    await service.track("logout", {});
    expect(myTracker.trackEvent).toHaveBeenLastCalledWith("logout", {
      identityMode: "guest",
    });
  });
});
