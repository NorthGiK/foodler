jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@react-native-firebase/analytics", () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(),
  resetAnalyticsData: jest.fn(),
  setAnalyticsCollectionEnabled: jest.fn(),
  setUserId: jest.fn(),
  setUserProperties: jest.fn(),
}));
jest.mock("@react-native-firebase/crashlytics", () => ({
  getCrashlytics: jest.fn(() => ({})),
  recordError: jest.fn(),
  setAttribute: jest.fn(),
  setAttributes: jest.fn(),
  setCrashlyticsCollectionEnabled: jest.fn(),
  setUserId: jest.fn(),
}));
