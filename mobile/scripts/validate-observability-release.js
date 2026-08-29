const required = [
  "EXPO_PUBLIC_MYTRACKER_API_KEY",
  "EXPO_PUBLIC_TRACER_DSN",
  "TRACER_APP_TOKEN",
  "TRACER_PLUGIN_TOKEN",
  "TRACER_VERSION_NAME",
  "TRACER_VERSION_CODE",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Release observability configuration is missing: ${missing.join(", ")}`,
  );
}
if (!/^https:\/\//.test(process.env.EXPO_PUBLIC_TRACER_DSN)) {
  throw new Error(
    "EXPO_PUBLIC_TRACER_DSN must be an HTTPS Sentry-compatible DSN",
  );
}
