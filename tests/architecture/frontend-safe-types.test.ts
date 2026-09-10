import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
describe("frontend-safe game contracts", () => {
  it("exports API types without server dependencies", () => {
    const content = [
      "src/lib/game-types.ts",
      "src/contracts/game.ts",
      "src/lib/api-types.ts",
    ]
      .map((file) => fs.readFileSync(path.resolve(file), "utf8"))
      .join("\n");
    expect(content).not.toMatch(/next\/|better-sqlite3|drizzle|node:/);
  });
});
