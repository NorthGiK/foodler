import { resolveApiUrls } from "../config";

describe("resolveApiUrls", () => {
  it.each([
    ["https://api.example.test", "https://api.example.test"],
    ["https://api.example.test/", "https://api.example.test"],
    ["https://api.example.test/api", "https://api.example.test"],
    ["https://api.example.test/api/", "https://api.example.test"],
  ])("keeps a single API prefix for %s", (configuredBase, expectedOrigin) => {
    expect(resolveApiUrls(configuredBase)).toEqual({
      apiOrigin: expectedOrigin,
      apiBase: `${expectedOrigin}/api`,
    });
  });
});
