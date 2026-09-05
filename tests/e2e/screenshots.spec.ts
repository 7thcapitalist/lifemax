import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { E2E_PASSWORD } from "./helpers";

const WIDTHS = [320, 390, 768, 1440] as const;
const OUT_DIR = path.resolve("docs/qa/screenshots");

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/today");
  await expect(
    page.getByRole("heading", { name: "Morning plan" }),
  ).toBeVisible();
}

test("responsive screenshots for Today and Character", async ({ page }) => {
  await signIn(page);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/today");
    await expect(
      page.getByRole("heading", { name: "Morning plan" }),
    ).toBeVisible();
    if (width === 320) {
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      const clientWidth = await page.evaluate(
        () => document.documentElement.clientWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    }
    await page.screenshot({
      path: path.join(OUT_DIR, `today-${width}.png`),
      fullPage: true,
    });

    await page.goto("/character");
    await expect(
      page.getByRole("heading", { name: "Who you are becoming" }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(OUT_DIR, `character-${width}.png`),
      fullPage: true,
    });
  }
});
