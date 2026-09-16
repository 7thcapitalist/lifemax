import { expect, test, type Page } from "@playwright/test";
import {
  E2E_DISPLAY_NAME,
  E2E_PASSWORD,
  E2E_TIMEZONE,
  onboardingFixture,
} from "./helpers";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/today");
}

test.describe.configure({ mode: "serial" });

test("morning loop updates character XP and currency", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");
  await page.waitForURL(/\/(setup|sign-in)/);
  if (page.url().includes("/sign-in")) {
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/today");
  } else {
    await page.getByLabel("Display name").fill(E2E_DISPLAY_NAME);
    await page.getByLabel("Timezone").fill(E2E_TIMEZONE);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Create owner" }).click();
    await page.waitForURL("**/onboarding");
    await page
      .getByLabel("Becoming statement")
      .fill(onboardingFixture.becomingStatement);
    await page.getByRole("button", { name: "Continue" }).click();
    for (const [index, aspect] of onboardingFixture.aspects.entries()) {
      await page.getByLabel("Name").nth(index).fill(aspect.name);
      await page.getByLabel("Definition").nth(index).fill(aspect.definition);
      await page
        .getByLabel("Desired identity")
        .nth(index)
        .fill(aspect.desiredIdentity);
      await page
        .getByLabel("Emphasis")
        .nth(index)
        .selectOption(aspect.emphasis);
    }
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Title").fill(onboardingFixture.northStar.title);
    await page
      .getByLabel("Motivation")
      .fill(onboardingFixture.northStar.motivation);
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .getByLabel("Chapter title")
      .fill(onboardingFixture.chapter.title);
    await page.getByLabel("Intent").fill(onboardingFixture.chapter.intent);
    await page
      .getByLabel("Start date")
      .fill(onboardingFixture.chapter.startDate);
    await page
      .getByLabel("End date (6–12 weeks)")
      .fill(onboardingFixture.chapter.endDate);
    await page
      .getByLabel("Title", { exact: true })
      .fill(onboardingFixture.milestone.title);
    await page
      .getByLabel("Done condition")
      .fill(onboardingFixture.milestone.doneCondition);
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .getByLabel("Statement")
      .fill(onboardingFixture.guardrail.statement);
    await page.getByRole("button", { name: "Complete onboarding" }).click();
    await page.waitForURL("**/program?from=onboarding");
    await expect(
      page.getByRole("heading", { name: onboardingFixture.chapter.title }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Begin Day 1" }).click();
    await page.waitForURL("**/today");
  }

  await expect(
    page.getByRole("heading", { name: "Morning plan" }),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "Save capacity" }).isVisible()) {
    await page.getByRole("radio", { name: "normal" }).check();
    await page.getByRole("button", { name: "Save capacity" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Choose your next move" }),
  ).toBeVisible();
  const coinsBefore = await page
    .locator(".brand-bar .coin-balance")
    .getAttribute("aria-label");
  await page.getByRole("button", { name: "Generate plan" }).click();
  await expect(page.locator(".mission-card .rationale").first()).toBeVisible();
  await page.getByRole("button", { name: "Add to today" }).first().click();
  await page.getByRole("button", { name: "Complete mission" }).last().click();
  await expect(page.getByRole("status")).toContainText(/coins.*XP/i);
  await expect(page.locator(".brand-bar .coin-balance")).not.toHaveAttribute(
    "aria-label",
    coinsBefore ?? "0 coins",
  );
  await expect(page.getByTestId("attribute-bar").first()).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("primary screens have no horizontal overflow at 375px", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link"),
  ).toHaveCount(5);
  for (const path of [
    "/today",
    "/quests",
    "/character",
    "/chapter",
    "/achievements",
    "/rewards",
  ]) {
    if (page.url().includes("/sign-in")) await signIn(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll, `${path} overflowed`).toBeLessThanOrEqual(
      dimensions.client,
    );
  }
});

test("failed API call renders a distinct retryable error state", async ({
  page,
}) => {
  await signIn(page);
  await page.route("**/api/v1/achievements", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "TEST_FAILURE",
        message: "Synthetic achievement failure",
      }),
    }),
  );
  await page.goto("/achievements");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Synthetic achievement failure" }),
  ).toContainText("Synthetic achievement failure");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("loading and empty states are visually distinct", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/v1/rewards", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto("/rewards");
  await expect(page.getByLabel("Opening the rewards cabinet…")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The cabinet is empty" }),
  ).toBeVisible();
});
