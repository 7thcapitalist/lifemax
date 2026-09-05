/**
 * Deterministic synthetic seed for returning-morning E2E.
 * Password is sent only in API request bodies and is never logged.
 */
import fs from "node:fs";
import path from "node:path";
import { parseConfig } from "../src/infrastructure/config/env";
import { openDatabase } from "../src/infrastructure/db/client";
import { runMigrations } from "../src/infrastructure/db/migrate";

const ORIGIN = process.env.APP_ORIGIN ?? "http://127.0.0.1:3100";
/** Must match tests/e2e/helpers.ts E2E_PASSWORD. Never log this value. */
const PASSWORD = "synthetic-e2e-passphrase";

const onboarding = {
  becomingStatement: "Become a grounded synthetic builder who protects rest.",
  aspects: ["Builder", "Body", "Scholar", "Explorer"].map((name) => ({
    name,
    definition: `Synthetic ${name} definition`,
    desiredIdentity: `Intentional ${name}`,
    emphasis: "active" as const,
  })),
  northStars: [
    {
      title: "Ship the private ritual",
      motivation: "Learn what mornings need",
    },
  ],
  chapter: {
    title: "Foundation chapter",
    intent: "Establish the quiet morning loop",
    startDate: "2026-08-01",
    endDate: "2026-09-26",
    milestones: [
      {
        title: "Morning loop works",
        doneCondition: "Resolve, capacity, briefing, and quests complete once",
        aspectIndexes: [0],
      },
    ],
  },
  guardrails: [
    {
      category: "recovery" as const,
      statement: "Do not let work displace sleep",
    },
  ],
};

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function request(
  pathname: string,
  init: RequestInit & { cookie?: string; csrf?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("Cookie", init.cookie);
  if (init.csrf) headers.set("X-CSRF-Token", init.csrf);
  if (init.method && init.method !== "GET")
    headers.set("Idempotency-Key", crypto.randomUUID());
  return fetch(`${ORIGIN}${pathname}`, { ...init, headers });
}

function cookieFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  const fromList = raw.find((value) => value.startsWith("lifemaxing_session="));
  if (fromList) return fromList.split(";")[0]!;
  const single = response.headers.get("set-cookie");
  const match = single?.match(/lifemaxing_session=[^;]+/);
  if (!match) throw new Error("Expected session cookie from login.");
  return match[0];
}

async function main() {
  const config = parseConfig({
    ...process.env,
    APP_ORIGIN: ORIGIN,
    SETUP_MODE: process.env.SETUP_MODE ?? "local",
    DATABASE_PATH: process.env.DATABASE_PATH ?? "./data/e2e-lifemaxing.sqlite",
    AI_MODE: "disabled",
    HOST: "127.0.0.1",
    PORT: process.env.PORT ?? "3100",
  });

  fs.mkdirSync(path.dirname(path.resolve(config.DATABASE_PATH)), {
    recursive: true,
  });
  if (process.env.SEED_RESET === "1" && fs.existsSync(config.DATABASE_PATH)) {
    fs.rmSync(config.DATABASE_PATH);
    for (const suffix of ["-wal", "-shm"]) {
      const side = `${config.DATABASE_PATH}${suffix}`;
      if (fs.existsSync(side)) fs.rmSync(side);
    }
  }
  const connection = openDatabase(config.DATABASE_PATH);
  runMigrations(connection, path.resolve("migrations"));
  connection.sqlite.close();

  const setup = await request("/api/v1/setup/owner", {
    method: "POST",
    body: JSON.stringify({
      displayName: "Synthetic Owner",
      timezone: "UTC",
      password: PASSWORD,
    }),
  });
  if (!setup.ok && setup.status !== 409) {
    throw new Error(`Setup failed: ${setup.status}`);
  }

  const login = await request("/api/v1/auth/session", {
    method: "POST",
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`Login failed: ${login.status}`);
  const loginBody = (await login.json()) as { csrfToken: string };
  const cookie = cookieFrom(login);

  const boot = await request("/api/v1/bootstrap", { cookie });
  const bootBody = (await boot.json()) as {
    csrfToken?: string;
    owner?: { setupCompleted: boolean };
    localDate?: string;
  };
  const csrf = bootBody.csrfToken ?? loginBody.csrfToken;

  if (!bootBody.owner?.setupCompleted) {
    const complete = await request("/api/v1/onboarding/complete", {
      method: "POST",
      cookie,
      csrf,
      body: JSON.stringify(onboarding),
    });
    if (!complete.ok) {
      throw new Error(`Onboarding failed: ${complete.status}`);
    }
  }

  const character = await request("/api/v1/character", { cookie });
  const characterBody = (await character.json()) as {
    aspects: Array<{ id: string; emphasis: string }>;
  };
  const aspectId = characterBody.aspects.find(
    (aspect) => aspect.emphasis !== "dormant",
  )?.id;
  if (!aspectId) throw new Error("Expected an active aspect.");

  const priorDate = daysAgo(3);
  const checkIn = await request(`/api/v1/check-ins/${priorDate}`, {
    method: "PUT",
    cookie,
    csrf,
    body: JSON.stringify({ capacity: "normal" }),
  });
  if (!checkIn.ok) throw new Error(`Prior check-in failed: ${checkIn.status}`);

  const priorQuest = await request("/api/v1/quests", {
    method: "POST",
    cookie,
    csrf,
    body: JSON.stringify({
      localDate: priorDate,
      title: "Prior synthetic quest",
      doneCondition: "Write one paragraph",
      reason: "Carry unfinished work neutrally",
      size: "standard",
      aspectIds: [aspectId],
    }),
  });
  if (!priorQuest.ok)
    throw new Error(`Prior quest create failed: ${priorQuest.status}`);
  const priorQuestBody = (await priorQuest.json()) as { id: string };
  const acceptPrior = await request(
    `/api/v1/quests/${priorQuestBody.id}/accept`,
    {
      method: "POST",
      cookie,
      csrf,
      body: JSON.stringify({ role: "main" }),
    },
  );
  if (!acceptPrior.ok)
    throw new Error(`Prior quest accept failed: ${acceptPrior.status}`);

  const todayDate = bootBody.localDate ?? new Date().toISOString().slice(0, 10);
  for (const [index, title] of [
    "Main synthetic quest",
    "Side synthetic quest",
    "Alternate synthetic quest",
  ].entries()) {
    const created = await request("/api/v1/quests", {
      method: "POST",
      cookie,
      csrf,
      body: JSON.stringify({
        localDate: todayDate,
        title,
        doneCondition: `Finish ${title}`,
        reason: "Deterministic morning practice",
        size: index === 0 ? "standard" : "small",
        aspectIds: [aspectId],
      }),
    });
    if (!created.ok)
      throw new Error(`Today quest create failed: ${created.status}`);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      displayName: "Synthetic Owner",
      timezone: "UTC",
      priorDate,
      todayDate,
      passwordEnv: "SYNTHETIC_E2E_PASSWORD",
    }) + "\n",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Seed failed";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
