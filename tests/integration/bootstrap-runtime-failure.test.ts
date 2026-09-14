import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as bootstrap } from "@/app/api/v1/bootstrap/route";
import { installTestRuntime } from "@/infrastructure/runtime";

describe("bootstrap runtime failure boundary", () => {
  afterEach(() => {
    installTestRuntime(undefined);
    vi.unstubAllEnvs();
  });

  it("returns a sanitized 503 when migration history is unavailable", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "lifemax-runtime-"),
    );
    try {
      vi.stubEnv("DB_DRIVER", "sqlite");
      vi.stubEnv("DATABASE_PATH", path.join(directory, "fresh.sqlite"));
      vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
      installTestRuntime(undefined);
      const response = await bootstrap(
        new NextRequest("http://127.0.0.1:3000/api/v1/bootstrap"),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: "STORE_UNAVAILABLE",
        message: "The private app is temporarily unavailable.",
      });
    } finally {
      fs.rmSync(directory, { recursive: true });
    }
  });
});
