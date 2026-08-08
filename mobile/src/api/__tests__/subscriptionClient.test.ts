const mockGetSubscription = jest.fn();
const mockCreatePayment = jest.fn();
const mockGetAccessToken = jest.fn();

function loadClient(): typeof import("../client") {
  jest.resetModules();
  jest.doMock("../generated/sdk.gen", () => ({
    Sdk: jest.fn().mockImplementation(() => ({
      getSubscriptionApiSubscriptionGet: mockGetSubscription,
      createPaymentApiSubscriptionPaymentPost: mockCreatePayment,
    })),
  }));
  jest.doMock("../transport", () => ({
    clearTokens: jest.fn(),
    getAccessToken: mockGetAccessToken,
    getRefreshToken: jest.fn(),
    setTokens: jest.fn(),
    unwrap: <T>(value: T) => value,
  }));
  return jest.requireActual<typeof import("../client")>("../client");
}

describe("subscription API client", () => {
  beforeEach(() => {
    mockGetSubscription.mockReset();
    mockCreatePayment.mockReset();
    mockGetAccessToken.mockReset();
  });

  it("loads the current subscription through the generated SDK", async () => {
    const status = {
      active: true,
      expiresAt: null,
      plan: "budget_monthly",
      platform: "yookassa",
    };
    mockGetSubscription.mockResolvedValue(status);
    const { api } = loadClient();

    await expect(api.getSubscription()).resolves.toEqual(status);
    expect(mockGetSubscription).toHaveBeenCalledWith();
  });

  it("sends the selected plan when creating a payment", async () => {
    mockGetAccessToken.mockResolvedValue("access-token");
    mockCreatePayment.mockResolvedValue({
      confirmationUrl: "https://payments.example/checkout",
    });
    const { api } = loadClient();

    await expect(api.makePurchase("premium_monthly")).resolves.toBe(
      "https://payments.example/checkout",
    );
    expect(mockCreatePayment).toHaveBeenCalledWith({
      body: { plan: "premium_monthly" },
    });
  });
});
