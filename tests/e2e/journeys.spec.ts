import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  E2E_DISPLAY_NAME,
  E2E_PASSWORD,
  E2E_TIMEZONE,
  onboardingFixture,
} from "./helpers";

async function csrfFromBootstrap(page: Page): Promise<string> {
  const boot = await page.request.get("/api/v1/bootstrap");
  const body = (await boot.json()) as { csrfToken?: string };
  expect(boot.ok()).toBeTruthy();
  expect(body.csrfToken).toBeTruthy();
  await page.evaluate(
    (token) => sessionStorage.setItem("lifemaxing_csrf", token),
    body.csrfToken!,
  );
  return body.csrfToken!;
}

async function apiJson(
  request: APIRequestContext,
  path: string,
  init: {
    method?: string;
    data?: unknown;
    csrf?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    Origin: "http://127.0.0.1:3100",
  };
  if (init.csrf) headers["X-CSRF-Token"] = init.csrf;
  if (init.method && init.method !== "GET")
    headers["Idempotency-Key"] = crypto.randomUUID();
  const response = await request.fetch(path, {
    method: init.method ?? "GET",
    headers,
    data: init.data,
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

test.describe.configure({ mode: "serial" });

test("setup and onboarding create the first morning character", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForURL(/\/(setup|sign-in)/);
  if (page.url().includes("/sign-in")) {
    test.skip(true, "Owner already provisioned in this database.");
  }

  await expect(
    page.getByRole("heading", { name: /Create your private space/i }),
  ).toBeVisible();
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
    await page.getByLabel("Emphasis").nth(index).selectOption(aspect.emphasis);
  }
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Title").fill(onboardingFixture.northStar.title);
  await page
    .getByLabel("Motivation")
    .fill(onboardingFixture.northStar.motivation);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Chapter title").fill(onboardingFixture.chapter.title);
  await page.getByLabel("Intent").fill(onboardingFixture.chapter.intent);
  await page.getByLabel("Start date").fill(onboardingFixture.chapter.startDate);
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
  await expect(page.getByText("Aspects trained")).toBeVisible();
  await expect(page.getByText("Shape of a typical day")).toBeVisible();
  await expect(page.getByText("Arc length")).toBeVisible();
  await expect(page.getByText("First week")).toBeVisible();

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page.getByRole("link", { name: "Begin Day 1" }).click();
  await page.waitForURL("**/today");
});

test("missed-day banner stays neutral", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/today");
  const csrf = await csrfFromBootstrap(page);
  const older = new Date();
  older.setUTCDate(older.getUTCDate() - 4);
  const olderDate = older.toISOString().slice(0, 10);
  const result = await apiJson(page.request, `/api/v1/check-ins/${olderDate}`, {
    method: "PUT",
    csrf,
    data: { capacity: "low" },
  });
  expect(result.response.ok()).toBeTruthy();
  await page.reload();
  const missedDayBanner = page
    .locator(".banner")
    .filter({ hasText: /days since your last activity/i });
  await expect(missedDayBanner).toBeVisible();
  await expect(missedDayBanner).not.toContainText(
    /shame|fail|streak reset|penalty/i,
  );
});

test("returning morning resolve → capacity → briefing → quest actions", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/today");

  const csrf = await csrfFromBootstrap(page);
  const character = await apiJson(page.request, "/api/v1/character");
  const aspectId = (
    character.body as { aspects: Array<{ id: string; emphasis: string }> }
  ).aspects.find((aspect) => aspect.emphasis !== "dormant")?.id;
  expect(aspectId).toBeTruthy();

  const priorDate = new Date();
  priorDate.setUTCDate(priorDate.getUTCDate() - 2);
  const prior = priorDate.toISOString().slice(0, 10);
  await apiJson(page.request, `/api/v1/check-ins/${prior}`, {
    method: "PUT",
    csrf,
    data: { capacity: "normal" },
  });
  const created = await apiJson(page.request, "/api/v1/quests", {
    method: "POST",
    csrf,
    data: {
      localDate: prior,
      title: "Prior synthetic quest",
      doneCondition: "Write one paragraph",
      reason: "Carry unfinished work neutrally",
      size: "standard",
      aspectIds: [aspectId],
    },
  });
  expect(created.response.ok()).toBeTruthy();
  const priorId = (created.body as { id: string }).id;
  await apiJson(page.request, `/api/v1/quests/${priorId}/accept`, {
    method: "POST",
    csrf,
    data: { role: "main" },
  });

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Resolve prior quests" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Completed" }).click();
  await expect(page.getByRole("heading", { name: /capacity/i })).toBeVisible();

  await page.getByRole("radio", { name: "normal" }).check();
  await page.getByRole("button", { name: "Save capacity" }).click();
  await expect(
    page.getByRole("heading", { name: "Morning briefing" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate briefing" }).click();
  await expect(page.getByText(/Mirror:/i)).toBeVisible();

  await page.getByLabel("Title").fill("Main synthetic quest");
  await page.getByLabel("Done condition").fill("Ship one bounded change");
  await page.getByLabel("Reason").fill("Advance the foundation chapter");
  await page.getByRole("button", { name: "Propose quest" }).click();
  await expect(
    page.getByRole("heading", { name: "Main synthetic quest" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  const editCard = page.locator("article.quest-card").filter({
    has: page.getByRole("button", { name: "Save edits" }),
  });
  await editCard.getByLabel("Title").fill("Main synthetic quest (edited)");
  await editCard.getByRole("button", { name: "Save edits" }).click();
  await expect(
    page.getByRole("heading", { name: "Main synthetic quest (edited)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept main" }).click();

  await page.getByLabel("Title").fill("Side synthetic quest");
  await page.getByLabel("Done condition").fill("Take a short recovery walk");
  await page.getByLabel("Reason").fill("Honor the recovery guardrail");
  await page.getByRole("button", { name: "Propose quest" }).click();
  await page.getByRole("button", { name: "Accept side" }).first().click();

  await page.getByLabel("Title").fill("Alternate synthetic quest");
  await page.getByLabel("Done condition").fill("Read one page slowly");
  await page.getByLabel("Reason").fill("Keep a spare option");
  await page.getByRole("button", { name: "Propose quest" }).click();
  await page
    .getByRole("button", { name: /Swap with/i })
    .first()
    .click();

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test("Character and Chronicle surfaces", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/today");

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Character" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Who you are becoming" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aspects" })).toBeVisible();
  await expect(
    page.getByText(/\b(?:XP|level|life score|global)\b/i),
  ).toHaveCount(0);
  const characterAxe = await new AxeBuilder({ page }).analyze();
  expect(characterAxe.violations).toEqual([]);

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Chronicle" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Outcomes and reflections" }),
  ).toBeVisible();
  const chronicleAxe = await new AxeBuilder({ page }).analyze();
  expect(chronicleAxe.violations).toEqual([]);
});

test("keyboard path can sign in and open Today", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Password").focus();
  await page.keyboard.type(E2E_PASSWORD);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/today");
  await expect(
    page.getByRole("heading", { name: "Morning plan" }),
  ).toBeVisible();
  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  const todayLink = primaryNav.getByRole("link", { name: "Today" });
  const characterLink = primaryNav.getByRole("link", { name: "Character" });
  await todayLink.focus();
  await expect(todayLink).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(characterLink).toBeFocused();
});
