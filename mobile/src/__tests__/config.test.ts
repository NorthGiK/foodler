import { normalizeApiBase } from "../config";

describe("normalizeApiBase", () => {
  it.each([
    ["https://api.example.test", "https://api.example.test/api"],
    ["https://api.example.test/", "https://api.example.test/api"],
    ["https://api.example.test/api", "https://api.example.test/api"],
    ["https://api.example.test/api/", "https://api.example.test/api"],
  ])("uses the API prefix for %s", (configuredBase, expectedBase) => {
    expect(normalizeApiBase(configuredBase)).toBe(expectedBase);
  });
});
