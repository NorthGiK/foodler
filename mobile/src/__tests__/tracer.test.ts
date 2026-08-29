import { scrubTracerValue } from "../tracer";

it("removes identifiers and private purchase or AI data from tracer payloads", () => {
  expect(
    scrubTracerValue({ email: "a@b.test", qrPayload: "secret", safe: "ok" }),
  ).toEqual({ email: "[redacted]", qrPayload: "[redacted]", safe: "ok" });
});
