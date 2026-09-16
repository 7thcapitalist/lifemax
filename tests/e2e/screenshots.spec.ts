import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  E2E_DISPLAY_NAME,
  E2E_PASSWORD,
  E2E_TIMEZONE,
  onboardingFixture,
} from "./helpers";

const WIDTHS = [320, 390, 768, 1440] as const;
const OUT_DIR = path.resolve("docs/qa/screenshots");

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

async function signIn(page: Page) {
  const bootstrap = await page.request.get("/api/v1/bootstrap");
  const boot = (await bootstrap.json()) as {
    authenticated: boolean;
    hasOwner: boolean;
  };
  if (!boot.hasOwner) {
    const origin = "http://127.0.0.1:3100";
    const setup = await page.request.post("/api/v1/setup/owner", {
      headers: { Origin: origin },
      data: {
        displayName: E2E_DISPLAY_NAME,
        timezone: E2E_TIMEZONE,
        password: E2E_PASSWORD,
      },
    });
    expect(setup.ok()).toBeTruthy();
    const session = await page.request.post("/api/v1/auth/session", {
      headers: { Origin: origin },
      data: { password: E2E_PASSWORD },
    });
    expect(session.ok()).toBeTruthy();
    const authenticated = await page.request.get("/api/v1/bootstrap");
    const authBody = (await authenticated.json()) as { csrfToken: string };
    const onboarding = await page.request.post("/api/v1/onboarding/complete", {
      headers: {
        Origin: origin,
        "X-CSRF-Token": authBody.csrfToken,
      },
      data: {
        becomingStatement: onboardingFixture.becomingStatement,
        aspects: onboardingFixture.aspects,
        northStars: [onboardingFixture.northStar],
        chapter: {
          ...onboardingFixture.chapter,
          milestones: [
            {
              ...onboardingFixture.milestone,
              aspectIndexes: [0],
            },
          ],
        },
        guardrails: [onboardingFixture.guardrail],
      },
    });
    expect(onboarding.ok()).toBeTruthy();
    await page.goto("/today");
    await expect(
      page.getByRole("heading", { name: "Morning plan" }),
    ).toBeVisible();
    return;
  }
  await page.goto("/sign-in");
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/today");
  await expect(
    page.getByRole("heading", { name: "Morning plan" }),
  ).toBeVisible();
}

async function seedMomentumEvidence(page: Page) {
  const origin = "http://127.0.0.1:3100";
  const bootstrap = await page.request.get("/api/v1/bootstrap");
  const { csrfToken } = (await bootstrap.json()) as { csrfToken: string };
  const headers = { Origin: origin, "X-CSRF-Token": csrfToken };
  const characterResponse = await page.request.get("/api/v1/character");
  const character = (await characterResponse.json()) as {
    attributes: Array<{ id: string }>;
  };
  const missionResponse = await page.request.post("/api/v1/missions", {
    headers,
    data: {
      localDate: "2026-09-14",
      title: "Synthetic momentum evidence",
      doneCondition: "Recorded for visual verification",
      kind: "progress",
      size: "small",
      attributeIds: [character.attributes[0]!.id],
    },
  });
  expect(missionResponse.ok()).toBeTruthy();
  const mission = (await missionResponse.json()) as { id: string };
  const accepted = await page.request.patch(`/api/v1/missions/${mission.id}`, {
    headers,
    data: { status: "accepted" },
  });
  expect(accepted.ok()).toBeTruthy();
  const completed = await page.request.post(
    `/api/v1/missions/${mission.id}/complete`,
    { headers, data: {} },
  );
  expect(completed.ok()).toBeTruthy();
  const rested = await page.request.put("/api/v1/check-ins/2026-09-15", {
    headers,
    data: { capacity: "low" },
  });
  expect(rested.ok()).toBeTruthy();
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

const ARC_SCREENS = [
  ["today", "/today", "Morning plan"],
  ["character", "/character", "Who you are becoming"],
  ["chapter", "/chapter", "The season you are in"],
  ["momentum", "/momentum", "The shape of this arc"],
  ["program", "/program", "Foundation chapter"],
  ["chronicle", "/chronicle", "Outcomes and reflections"],
] as const;

test("375px light, dark, and greyscale arc evidence", async ({ page }) => {
  await signIn(page);
  await seedMomentumEvidence(page);
  await page.setViewportSize({ width: 375, height: 812 });

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [name, route, heading] of ARC_SCREENS) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(
        dimensions.clientWidth + 1,
      );
      await page.screenshot({
        path: path.join(OUT_DIR, `${name}-375-${scheme}.png`),
        fullPage: true,
      });
    }
  }

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/momentum");
  await expect(
    page.getByRole("heading", { name: "The shape of this arc" }),
  ).toBeVisible();
  await page.addStyleTag({ content: "html { filter: grayscale(1); }" });
  await page.screenshot({
    path: path.join(OUT_DIR, "momentum-375-greyscale.png"),
    fullPage: true,
  });
});
