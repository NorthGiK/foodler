const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier/flat");

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: [
      ".expo/**",
      "android/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "src/api/generated/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Existing Animated.Value patterns are reported as render-time ref access
      // by the experimental React compiler rules. Enable these incrementally
      // after the performance refactor instead of blocking the baseline.
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
  {
    files: ["jest.setup.js"],
    languageOptions: {
      globals: {
        jest: "readonly",
        require: "readonly",
      },
    },
  },
  prettierConfig,
]);
