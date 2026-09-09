import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { LoginRateLimiter } from "@/application/auth/rate-limit";
import { AuthService } from "@/application/auth/service";
import { BootstrapService } from "@/application/bootstrap/service";
import { CharacterService } from "@/application/character/service";
import { ChronicleService } from "@/application/chronicle/service";
import { OnboardingService } from "@/application/onboarding/service";
import { PlanningService } from "@/application/planning/service";
import { TodayService } from "@/application/today/service";
import { GET as bootstrap } from "@/app/api/v1/bootstrap/route";
import { POST as login } from "@/app/api/v1/auth/session/route";
import { POST as generateBriefing } from "@/app/api/v1/briefings/[localDate]/generate/route";
import { GET as character } from "@/app/api/v1/character/route";
import { PUT as upsertCheckIn } from "@/app/api/v1/check-ins/[localDate]/route";
import { GET as chronicle } from "@/app/api/v1/chronicle/route";
import { POST as completeOnboarding } from "@/app/api/v1/onboarding/complete/route";
import { POST as acceptQuest } from "@/app/api/v1/quests/[id]/accept/route";
import { POST as declineQuest } from "@/app/api/v1/quests/[id]/decline/route";
import { POST as resolveQuest } from "@/app/api/v1/quests/[id]/resolve/route";
import { POST as swapQuest } from "@/app/api/v1/quests/[id]/swap/route";
import { PATCH as updateQuest } from "@/app/api/v1/quests/[id]/route";
import { POST as createQuest } from "@/app/api/v1/quests/route";
import { GET as today } from "@/app/api/v1/today/route";
import { DeterministicBriefingGenerator } from "@/domain/briefing/generator";
import { IntlCalendarService } from "@/infrastructure/clock/system";
import { SqliteRepositories } from "@/infrastructure/db/repositories";
import { type AppRuntime, installTestRuntime } from "@/infrastructure/runtime";
import { FixedClock, migratedDatabase } from "../helpers";

const ORIGIN = "https://lifemaxing.test";
const PASSWORD = "synthetic-passphrase-only";
const DATE = "2026-09-03";

const validOnboarding = {
  becomingStatement: "Become a grounded synthetic builder.",
  aspects: ["Builder", "Body", "Scholar", "Explorer"].map((name) => ({
    name,
    definition: `Synthetic ${name}`,
    desiredIdentity: `Intentional ${name}`,
    emphasis: "active" as const,
  })),
  northStars: [{ title: "Ship safely", motivation: "Learn" }],
  chapter: {
    title: "Foundation",
    intent: "Establish a base",
    startDate: "2026-09-01",
    endDate: "2026-10-27",
    milestones: [
      {
        title: "Foundation complete",
        doneCondition: "Checks pass",
        aspectIndexes: [0],
      },
    ],
  },
  guardrails: [{ category: "recovery" as const, statement: "Protect rest" }],
};

function request(
  pathname: string,
  init: ConstructorParameters<typeof NextRequest>[1] = {},
): NextRequest {
  return new NextRequest(`${ORIGIN}${pathname}`, init);
}

function cookieValue(response: Response): string {
  const match = response.headers
    .get("set-cookie")
    ?.match(/lifemaxing_session=([^;]+)/);
  if (!match) throw new Error("Expected session cookie.");
  return match[1]!;
}

function installRuntime() {
  const connection = migratedDatabase();
  const clock = new FixedClock(new Date("2026-09-03T12:00:00Z"));
  const calendar = new IntlCalendarService();
  const repositories = new SqliteRepositories(connection);
  const briefingGenerator = new DeterministicBriefingGenerator();
  const auth = new AuthService(
    repositories.owners,
    repositories.sessions,
    repositories.transactions,
    clock,
  );
  const value: AppRuntime = {
    config: {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: 3000,
      APP_ORIGIN: ORIGIN,
      SETUP_MODE: "disabled",
      DB_DRIVER: "sqlite",
      DATABASE_PATH: ":memory:",
      AI_MODE: "disabled",
    },
    connection,
    clock,
    repositories,
    loginLimiter: new LoginRateLimiter(clock),
    auth,
    onboarding: new OnboardingService(
      repositories.owners,
      repositories.transactions,
      clock,
    ),
    bootstrap: new BootstrapService(
      repositories.owners,
      repositories.character,
      clock,
      calendar,
      "disabled",
    ),
    today: new TodayService(
      repositories.owners,
      repositories.character,
      repositories.planning,
      clock,
      calendar,
    ),
    planning: new PlanningService(
      repositories.owners,
      repositories.character,
      repositories.planning,
      repositories.transactions,
      clock,
      calendar,
      briefingGenerator,
    ),
    character: new CharacterService(
      repositories.owners,
      repositories.character,
    ),
    chronicle: new ChronicleService(repositories.planning),
  };
  installTestRuntime(value);
  return value;
}

async function authedSession(app: AppRuntime) {
  await app.auth.setupOwner({
    displayName: "Synthetic Owner",
    timezone: "UTC",
    password: PASSWORD,
  });
  const signedIn = await login(
    request("/api/v1/auth/session", {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.40",
      },
      body: JSON.stringify({ password: PASSWORD }),
    }),
  );
  let token = cookieValue(signedIn);
  let csrf = ((await signedIn.json()) as { csrfToken: string }).csrfToken;
  const onboard = await completeOnboarding(
    request("/api/v1/onboarding/complete", {
      method: "POST",
      headers: {
        origin: ORIGIN,
        cookie: `lifemaxing_session=${token}`,
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      body: JSON.stringify(validOnboarding),
    }),
  );
  expect(onboard.status).toBe(200);
  token = cookieValue(onboard);
  const boot = await bootstrap(
    request("/api/v1/bootstrap", {
      headers: { cookie: `lifemaxing_session=${token}` },
    }),
  );
  expect(boot.status).toBe(200);
  const body = (await boot.json()) as {
    csrfToken: string;
    navigation: string[];
    setup: { completed: boolean };
  };
  expect(body.csrfToken).toBeTruthy();
  expect(body.navigation).toEqual(["today", "character", "chronicle"]);
  expect(body.setup.completed).toBe(true);
  token = cookieValue(boot);
  csrf = body.csrfToken;
  return { token, csrf };
}

function mutationHeaders(token: string, csrf: string) {
  return {
    origin: ORIGIN,
    cookie: `lifemaxing_session=${token}`,
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

describe("planning and today morning loop", () => {
  let active: AppRuntime | undefined;

  afterEach(() => {
    active?.connection.sqlite.close();
    installTestRuntime(undefined);
  });

  it("runs check-in, quest lifecycle, deterministic briefing, and read models", async () => {
    active = installRuntime();
    const session = await authedSession(active);
    let token = session.token;
    const csrf = session.csrf;

    const checkIn = await upsertCheckIn(
      request(`/api/v1/check-ins/${DATE}`, {
        method: "PUT",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({ capacity: "normal", reflection: "Ready" }),
      }),
      { params: Promise.resolve({ localDate: DATE }) },
    );
    expect(checkIn.status).toBe(200);
    token = cookieValue(checkIn);

    const aspects = active.repositories.character.listAspects(
      active.repositories.owners.findCredential()!.ownerId,
    );
    const aspectId = aspects[0]!.id;

    const createdMain = await createQuest(
      request("/api/v1/quests", {
        method: "POST",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({
          localDate: DATE,
          title: "Ship foundation",
          doneCondition: "PR merged",
          reason: "Advance chapter",
          size: "standard",
          aspectIds: [aspectId],
        }),
      }),
    );
    expect(createdMain.status).toBe(201);
    token = cookieValue(createdMain);
    const mainQuest = (await createdMain.json()) as { id: string };

    const createdSide = await createQuest(
      request("/api/v1/quests", {
        method: "POST",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({
          localDate: DATE,
          title: "Walk outside",
          doneCondition: "20 minutes outdoors",
          reason: "Protect recovery",
          size: "small",
          aspectIds: [aspectId],
        }),
      }),
    );
    expect(createdSide.status).toBe(201);
    token = cookieValue(createdSide);
    const sideQuest = (await createdSide.json()) as { id: string };

    const createdSwap = await createQuest(
      request("/api/v1/quests", {
        method: "POST",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({
          localDate: DATE,
          title: "Read one page",
          doneCondition: "Page finished",
          reason: "Scholar habit",
          size: "small",
          aspectIds: [aspectId],
        }),
      }),
    );
    expect(createdSwap.status).toBe(201);
    token = cookieValue(createdSwap);
    const swapIn = (await createdSwap.json()) as { id: string };

    const patched = await updateQuest(
      request(`/api/v1/quests/${sideQuest.id}`, {
        method: "PATCH",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({ title: "Walk outside calmly" }),
      }),
      { params: Promise.resolve({ id: sideQuest.id }) },
    );
    expect(patched.status).toBe(200);
    token = cookieValue(patched);

    const acceptedMain = await acceptQuest(
      request(`/api/v1/quests/${mainQuest.id}/accept`, {
        method: "POST",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({ role: "main" }),
      }),
      { params: Promise.resolve({ id: mainQuest.id }) },
    );
    expect(acceptedMain.status).toBe(200);
    token = cookieValue(acceptedMain);

    const acceptedSide = await acceptQuest(
      request(`/api/v1/quests/${sideQuest.id}/accept`, {
        method: "POST",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({ role: "side" }),
      }),
      { params: Promise.resolve({ id: sideQuest.id }) },
    );
    expect(acceptedSide.status).toBe(200);
    token = cookieValue(acceptedSide);

    const swapped = await swapQuest(
      request(`/api/v1/quests/${sideQuest.id}/swap`, {
        method: "POST",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({
          replacementQuestId: swapIn.id,
          role: "side",
        }),
      }),
      { params: Promise.resolve({ id: sideQuest.id }) },
    );
    expect(swapped.status).toBe(200);
    token = cookieValue(swapped);
    const swapBody = (await swapped.json()) as {
      declined: { status: string };
      accepted: { id: string; status: string };
    };
    expect(swapBody.declined.status).toBe("declined");
    expect(swapBody.accepted.status).toBe("accepted");
    expect(swapBody.accepted.id).toBe(swapIn.id);

    const declinedExtra = await createQuest(
      request("/api/v1/quests", {
        method: "POST",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({
          localDate: DATE,
          title: "Skip this",
          doneCondition: "N/A",
          reason: "Not today",
          aspectIds: [aspectId],
        }),
      }),
    );
    token = cookieValue(declinedExtra);
    const extra = (await declinedExtra.json()) as { id: string };
    const declined = await declineQuest(
      request(`/api/v1/quests/${extra.id}/decline`, {
        method: "POST",
        headers: mutationHeaders(token, csrf),
      }),
      { params: Promise.resolve({ id: extra.id }) },
    );
    expect(declined.status).toBe(200);
    token = cookieValue(declined);

    const briefing = await generateBriefing(
      request(`/api/v1/briefings/${DATE}/generate`, {
        method: "POST",
        headers: mutationHeaders(token, csrf),
      }),
      { params: Promise.resolve({ localDate: DATE }) },
    );
    expect(briefing.status).toBe(200);
    token = cookieValue(briefing);
    const briefingBody = (await briefing.json()) as {
      id: string;
      inputFingerprint: string;
      mirror: string;
    };
    expect(briefingBody.mirror).toContain("normal capacity");

    const briefingAgain = await generateBriefing(
      request(`/api/v1/briefings/${DATE}/generate`, {
        method: "POST",
        headers: mutationHeaders(token, csrf),
      }),
      { params: Promise.resolve({ localDate: DATE }) },
    );
    expect(briefingAgain.status).toBe(200);
    token = cookieValue(briefingAgain);
    expect(((await briefingAgain.json()) as { id: string }).id).toBe(
      briefingBody.id,
    );

    const resolved = await resolveQuest(
      request(`/api/v1/quests/${mainQuest.id}/resolve`, {
        method: "POST",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({
          outcome: "completed",
          reflection: "Merged cleanly",
        }),
      }),
      { params: Promise.resolve({ id: mainQuest.id }) },
    );
    expect(resolved.status).toBe(200);
    token = cookieValue(resolved);
    expect(((await resolved.json()) as { status: string }).status).toBe(
      "completed",
    );

    const todayView = await today(
      request("/api/v1/today", {
        headers: { cookie: `lifemaxing_session=${token}` },
      }),
    );
    expect(todayView.status).toBe(200);
    token = cookieValue(todayView);
    const todayBody = (await todayView.json()) as {
      localDate: string;
      checkIn: { capacity: string } | null;
      briefing: { id: string } | null;
      missedDayGap: null;
      quests: Array<{ id: string }>;
    };
    expect(todayBody.localDate).toBe(DATE);
    expect(todayBody.checkIn?.capacity).toBe("normal");
    expect(todayBody.briefing?.id).toBe(briefingBody.id);
    expect(todayBody.missedDayGap).toBeNull();
    expect(todayBody.quests.length).toBeGreaterThanOrEqual(3);

    const characterView = await character(
      request("/api/v1/character", {
        headers: { cookie: `lifemaxing_session=${token}` },
      }),
    );
    expect(characterView.status).toBe(200);
    token = cookieValue(characterView);
    const characterBody = (await characterView.json()) as {
      becomingStatement: string;
      aspects: unknown[];
      activeChapter: { milestones: unknown[] } | null;
      guardrails: unknown[];
    };
    expect(characterBody.becomingStatement).toContain("grounded");
    expect(characterBody.aspects).toHaveLength(4);
    expect(characterBody.activeChapter?.milestones).toHaveLength(1);
    expect(characterBody.guardrails).toHaveLength(1);

    const chronicleView = await chronicle(
      request("/api/v1/chronicle", {
        headers: { cookie: `lifemaxing_session=${token}` },
      }),
    );
    expect(chronicleView.status).toBe(200);
    const chronicleBody = (await chronicleView.json()) as {
      items: Array<{ outcome: string; reflection: string | null }>;
      nextCursor: string | null;
    };
    expect(chronicleBody.items).toHaveLength(1);
    expect(chronicleBody.items[0]?.outcome).toBe("completed");
    expect(chronicleBody.items[0]?.reflection).toBe("Merged cleanly");
  });

  it("reports a neutral missed-day gap without penalties", async () => {
    active = installRuntime();
    const { token } = await authedSession(active);
    const ownerId = active.repositories.owners.findCredential()!.ownerId;
    const aspectId = active.repositories.character.listAspects(ownerId)[0]!.id;
    active.repositories.planning.createQuest({
      id: "01900000-0000-7000-8000-000000000001",
      ownerId,
      localDate: "2026-08-30",
      title: "Earlier quest",
      doneCondition: "Done",
      reason: "History",
      size: "small",
      source: "owner",
      milestoneId: null,
      aspectIds: [aspectId],
      now: "2026-08-30T12:00:00.000Z",
    });

    const todayView = await today(
      request("/api/v1/today", {
        headers: { cookie: `lifemaxing_session=${token}` },
      }),
    );
    expect(todayView.status).toBe(200);
    const body = (await todayView.json()) as {
      missedDayGap: { daysSinceLastActivity: number; message: string } | null;
    };
    expect(body.missedDayGap?.daysSinceLastActivity).toBe(4);
    expect(body.missedDayGap?.message).toMatch(/Continuing from current/);
    expect(body.missedDayGap?.message.toLowerCase()).not.toMatch(
      /fail|shame|penalty|streak/,
    );
  });

  it("rejects CSRF-less quest mutations and foreign aspect links", async () => {
    active = installRuntime();
    const { token, csrf } = await authedSession(active);
    expect(
      (
        await createQuest(
          request("/api/v1/quests", {
            method: "POST",
            headers: {
              origin: ORIGIN,
              cookie: `lifemaxing_session=${token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              title: "No csrf",
              doneCondition: "x",
              reason: "y",
              aspectIds: ["00000000-0000-7000-8000-000000000099"],
            }),
          }),
        )
      ).status,
    ).toBe(401);

    const response = await createQuest(
      request("/api/v1/quests", {
        method: "POST",
        headers: mutationHeaders(token, csrf),
        body: JSON.stringify({
          title: "Bad link",
          doneCondition: "x",
          reason: "y",
          aspectIds: ["00000000-0000-7000-8000-000000000099"],
        }),
      }),
    );
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe(
      "ASPECT_NOT_FOUND",
    );
  });
});
