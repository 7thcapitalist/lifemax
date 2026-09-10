import { describe, expect, it } from "vitest";
import { parseConfig } from "@/infrastructure/config/env";

describe("configuration privacy gate", () => {
  it("defaults AI to disabled and rejects every enablement value", () => {
    expect(parseConfig({}).AI_MODE).toBe("disabled");
    expect(() => parseConfig({ AI_MODE: "external" })).toThrow();
    expect(() => parseConfig({ AI_MODE: "enabled" })).toThrow();
  });
  it("defaults setup closed and accepts only canonical web origins", () => {
    expect(parseConfig({}).SETUP_MODE).toBe("disabled");
    for (const APP_ORIGIN of [
      "http://127.0.0.1.evil.example",
      "http://127.0.0.10:3000",
      "http://example.test",
      "https://example.test/path",
      "https://user:password@example.test",
      "ftp://example.test",
    ])
      expect(() => parseConfig({ APP_ORIGIN }), APP_ORIGIN).toThrow();
    for (const APP_ORIGIN of [
      "http://127.0.0.1:3000",
      "http://localhost:3000",
      "http://[::1]:3000",
      "https://example.test",
    ])
      expect(parseConfig({ APP_ORIGIN }).APP_ORIGIN).toBe(APP_ORIGIN);
  });
  it("fails closed on Vercel storage, origin, and environment isolation", () => {
    expect(() => parseConfig({ VERCEL: "1" })).toThrow(
      /durable libsql storage/,
    );
    const production = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      NODE_ENV: "production",
      DB_DRIVER: "libsql",
      DATABASE_URL: "libsql://lifemax-production.example",
      DATABASE_AUTH_TOKEN: "synthetic",
      DATABASE_ENVIRONMENT: "production",
      APP_ORIGIN: "https://lifemax.example",
    } as const;
    expect(parseConfig(production).APP_ORIGIN).toBe("https://lifemax.example");
    expect(() =>
      parseConfig({ ...production, DATABASE_ENVIRONMENT: "preview" }),
    ).toThrow(/production-tagged database/);
    expect(() =>
      parseConfig({ ...production, APP_ORIGIN: "http://127.0.0.1:3000" }),
    ).toThrow(/explicit HTTPS APP_ORIGIN/);
    expect(
      parseConfig({
        ...production,
        VERCEL_ENV: "preview",
        DATABASE_ENVIRONMENT: "preview",
        APP_ORIGIN: undefined,
        VERCEL_URL: "lifemax-preview.example",
      }).APP_ORIGIN,
    ).toBe("https://lifemax-preview.example");
  });
});
