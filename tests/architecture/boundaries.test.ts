import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(root: string): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(root, entry.name))
        : [path.join(root, entry.name)],
    );
}
describe("module boundaries and no AI enablement", () => {
  it("keeps domain independent from framework, database, environment, and network modules", () => {
    const content = files(path.resolve("src/domain"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    expect(content).not.toMatch(/next\/|drizzle|process\.env|fetch\s*\(/);
  });
  it("keeps application services behind ports and free of adapter dependencies", () => {
    const content = files(path.resolve("src/application"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    expect(content).not.toMatch(
      /from\s+["'](?:@\/infrastructure|next\/|drizzle-orm)|process\.env|fetch\s*\(/,
    );
  });
  it("keeps route handlers free of direct database adapter access", () => {
    const content = files(path.resolve("src/app/api/v1"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    expect(content).not.toMatch(
      /drizzle-orm|infrastructure\/db\/(?:client|schema)|\.repositories\b|\.connection\b/,
    );
  });
  it("contains no external AI SDK, provider config, or enablement mode", () => {
    const manifests = [
      fs.readFileSync("package.json", "utf8"),
      ...files(path.resolve("src")).map((file) =>
        fs.readFileSync(file, "utf8"),
      ),
    ].join("\n");
    expect(manifests).not.toMatch(
      /openai|anthropic|gemini|AI_MODE:\s*z\.enum|kind:\s*'external-ai'/i,
    );
  });
});
