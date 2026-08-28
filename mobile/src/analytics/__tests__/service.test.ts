import AsyncStorage from "@react-native-async-storage/async-storage";
import * as analyticsSdk from "@react-native-firebase/analytics";
import * as crashlyticsSdk from "@react-native-firebase/crashlytics";

import { api } from "@/api/client";
import { AnalyticsService } from "../service";

jest.mock("@/api/client", () => ({
  api: {
    resolveAnalyticsIdentity: jest.fn(),
    setAnalyticsIdentityMode: jest.fn(),
  },
  getDeviceId: jest.fn().mockResolvedValue("device-id"),
}));

describe("Firebase telemetry identity", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });
  it("keeps a guest anonymous while collection remains enabled after consent", async () => {
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    await service.resolvedAuth();
    expect(analyticsSdk.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(
      expect.anything(),
      true,
    );
    expect(analyticsSdk.setUserId).toHaveBeenCalledWith(
      expect.anything(),
      null,
    );
    expect(crashlyticsSdk.setUserId).toHaveBeenCalledWith(
      expect.anything(),
      "",
    );
  });
  it("anonymizes immediately before an offline preference retry", async () => {
    jest
      .mocked(api.setAnalyticsIdentityMode)
      .mockRejectedValueOnce(new Error("offline"));
    const service = new AnalyticsService();
    await service.resolveConsent(true);
    await expect(service.setPreference("anonymous")).resolves.toBe("pending");
    expect(analyticsSdk.resetAnalyticsData).toHaveBeenCalled();
    await expect(service.preferenceState()).resolves.toMatchObject({
      mode: "anonymous",
      pendingMode: "anonymous",
    });
  });
});
