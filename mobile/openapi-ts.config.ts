import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../contracts/openapi.json",
  output: "src/api/generated",
  plugins: [
    "@hey-api/typescript",
    {
      name: "@hey-api/sdk",
      operations: {
        strategy: "single",
      },
    },
    "@hey-api/client-fetch",
  ],
});
