module.exports = {
  preset: "jest-expo",
  watchman: false,
  setupFiles: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/android/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/api/generated/**",
    "!src/**/*.d.ts",
  ],
};
