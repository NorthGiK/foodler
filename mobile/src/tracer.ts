import { NativeModules, Platform } from "react-native";

type TracerNative = { init(dsn: string): Promise<void> };
const native = NativeModules.FoodlerTracer as TracerNative | undefined;
const dsn = process.env.EXPO_PUBLIC_TRACER_DSN;

const sensitiveKey =
  /(?:user.?id|email|token|authorization|cookie|qr|receipt|cheque|prompt|context|ai)/i;
const sensitiveValue =
  /(?:bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:^|\s)(?:t|fn|fp|i|n|s)=\S+)/i;

export function scrubTracerValue(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[redacted]";
  if (typeof value === "string")
    return value.length > 256 || sensitiveValue.test(value)
      ? "[redacted]"
      : value;
  if (Array.isArray(value)) return value.map((item) => scrubTracerValue(item));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        scrubTracerValue(item, name),
      ]),
    );
  }
  return value;
}

function stackFrames(error: Error): Record<string, unknown>[] {
  return (error.stack ?? "")
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
      if (!match) return [];
      return [
        {
          function: match[1] || "<anonymous>",
          filename: match[2],
          lineno: Number(match[3]),
          colno: Number(match[4]),
          in_app: true,
        },
      ];
    })
    .reverse();
}

function envelopeUrl(rawDsn: string): string | null {
  try {
    const url = new URL(rawDsn);
    const projectId = url.pathname.replaceAll("/", "");
    if (!projectId || !url.username) return null;
    return `${url.protocol}//${url.host}/api/${projectId}/envelope/?sentry_key=${encodeURIComponent(url.username)}`;
  } catch {
    return null;
  }
}

async function sendSentryEvent(event: Record<string, unknown>): Promise<void> {
  if (!dsn) return;
  const endpoint = envelopeUrl(dsn);
  if (!endpoint) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const id =
      `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(
        0,
        32,
      );
    const header = JSON.stringify({
      event_id: id,
      sent_at: new Date().toISOString(),
    });
    const item = JSON.stringify({
      type: "event",
      content_type: "application/json",
    });
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: `${header}\n${item}\n${JSON.stringify(event)}`,
      signal: controller.signal,
    });
  } catch {
    // Telemetry must never affect the local-first UI.
  } finally {
    clearTimeout(timer);
  }
}

export const tracer = {
  async start(consent: boolean): Promise<void> {
    if (consent && Platform.OS === "android" && native && dsn)
      await native.init(dsn);
  },
  async captureException(
    error: unknown,
    context: Record<string, unknown> = {},
  ): Promise<void> {
    if (!dsn) return;
    const exception =
      error instanceof Error ? error : new Error("UnknownError");
    // Native capture is disabled for JS errors; this is the Sentry-compatible path.
    await sendSentryEvent(
      scrubTracerValue({
        level: "error",
        exception: {
          values: [
            {
              type: exception.name,
              value: exception.name,
              stacktrace: { frames: stackFrames(exception) },
            },
          ],
        },
        extra: context,
      }) as Record<string, unknown>,
    );
  },
};
