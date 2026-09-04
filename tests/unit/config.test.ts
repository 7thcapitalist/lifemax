import { describe, expect, it } from "vitest";
import { parseConfig } from "@/infrastructure/config/env";

describe("configuration privacy gate", () => {
  it("defaults AI to disabled and rejects every enablement value", () => {
    expect(parseConfig({}).AI_MODE).toBe("disabled");
    expect(() => parseConfig({ AI_MODE: "external" })).toThrow();
    expect(() => parseConfig({ AI_MODE: "enabled" })).toThrow();
  });
});
