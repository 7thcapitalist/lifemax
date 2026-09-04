import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { LoginRateLimiter } from "@/application/auth/rate-limit";
import { AuthService } from "@/application/auth/service";
import { BootstrapService } from "@/application/bootstrap/service";
import { OnboardingService } from "@/application/onboarding/service";
import { MAX_BODY_BYTES } from "@/app/api/http";
import { GET as bootstrap } from "@/app/api/v1/bootstrap/route";
import {
  DELETE as logout,
  POST as login,
} from "@/app/api/v1/auth/session/route";
import { POST as completeOnboarding } from "@/app/api/v1/onboarding/complete/route";
import { POST as setupOwner } from "@/app/api/v1/setup/owner/route";
import { IntlCalendarService } from "@/infrastructure/clock/system";
import { SqliteRepositories } from "@/infrastructure/db/repositories";
import { type AppRuntime, installTestRuntime } from "@/infrastructure/runtime";
import { FixedClock, migratedDatabase } from "../helpers";

const ORIGIN = "https://lifemaxing.test";
const PASSWORD = "synthetic-passphrase-only";
const validOnboarding = {
  becomingStatement: "Become a grounded synthetic builder.",
  aspects: ["Builder", "Body", "Scholar", "Explorer"].map((name) => ({
    name,
    definition: `Synthetic ${name}`,
    desiredIdentity: `Intentional ${name}`,
    emphasis: "active",
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
  guardrails: [{ category: "recovery", statement: "Protect rest" }],
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

function installRuntime(setupMode: "disabled" | "local" = "disabled") {
  const connection = migratedDatabase();
  const clock = new FixedClock(new Date("2026-09-03T12:00:00Z"));
  const repositories = new SqliteRepositories(connection);
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
      SETUP_MODE: setupMode,
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
      clock,
      new IntlCalendarService(),
    ),
  };
  installTestRuntime(value);
  return value;
}

async function createOwner(auth: AuthService): Promise<void> {
  await auth.setupOwner({
    displayName: "Synthetic Owner",
    timezone: "UTC",
    password: PASSWORD,
  });
}

async function loginRequest(
  password = PASSWORD,
  source = "192.0.2.10",
): Promise<Response> {
  return login(
    request("/api/v1/auth/session", {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-forwarded-for": source,
      },
      body: JSON.stringify({ password }),
    }),
  );
}

describe("HTTP security boundaries", () => {
  let active: AppRuntime | undefined;

  afterEach(() => {
    active?.connection.sqlite.close();
    installTestRuntime(undefined);
  });

  it("keeps setup closed unless explicitly local and rejects host/origin takeover", async () => {
    active = installRuntime("disabled");
    const payload = JSON.stringify({
      displayName: "Synthetic Owner",
      timezone: "UTC",
      password: PASSWORD,
    });
    const options = {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: payload,
    };
    expect(
      (
        await setupOwner(
          new NextRequest("http://127.0.0.1/api/v1/setup/owner", options),
        )
      ).status,
    ).toBe(403);

    active.config.SETUP_MODE = "local";
    expect(
      (await setupOwner(request("/api/v1/setup/owner", options))).status,
    ).toBe(403);

    active.config.APP_ORIGIN = "http://127.0.0.1";
    expect(
      (
        await setupOwner(
          new NextRequest("http://127.0.0.1/api/v1/setup/owner", {
            ...options,
            headers: { ...options.headers, origin: "http://attacker.test" },
          }),
        )
      ).status,
    ).toBe(403);

    const localOptions = {
      ...options,
      headers: { ...options.headers, origin: "http://127.0.0.1" },
    };
    expect(
      (
        await setupOwner(
          new NextRequest("http://127.0.0.1/api/v1/setup/owner", {
            ...localOptions,
            headers: {
              ...localOptions.headers,
              "x-forwarded-for": "203.0.113.10",
            },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await setupOwner(
          new NextRequest("http://127.0.0.1/api/v1/setup/owner", localOptions),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await setupOwner(
          new NextRequest("http://127.0.0.1/api/v1/setup/owner", localOptions),
        )
      ).status,
    ).toBe(409);
    expect(active.repositories.owners.count()).toBe(1);
  });

  it("sets hardened cookies, permits bounded parallel use, expires replay, and revokes", async () => {
    active = installRuntime();
    await createOwner(active.auth);
    const signedIn = await loginRequest();
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers.get("set-cookie");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Max-Age=43200/i);
    const csrf = ((await signedIn.json()) as { csrfToken: string }).csrfToken;
    const token = cookieValue(signedIn);

    const parallel = await Promise.all(
      Array.from({ length: 4 }, () =>
        bootstrap(
          request("/api/v1/bootstrap", {
            headers: { cookie: "lifemaxing_session=" + token },
          }),
        ),
      ),
    );
    expect(parallel.map((response) => response.status)).toEqual([
      200, 200, 200, 200,
    ]);
    const rotatingResponses = parallel.filter((response) =>
      response.headers.get("set-cookie")?.includes("lifemaxing_session="),
    );
    expect(rotatingResponses).toHaveLength(1);
    const rotated = cookieValue(rotatingResponses[0]!);
    expect(rotated).not.toBe(token);
    expect(
      (
        (await parallel[3]!.json()) as {
          owner: { setupCompleted: boolean };
        }
      ).owner.setupCompleted,
    ).toBe(false);

    // A late response authenticated by the previous token carries no stale cookie,
    // so applying responses out of order cannot overwrite the current token.
    expect(
      parallel
        .filter((response) => response !== rotatingResponses[0])
        .every((response) => response.headers.get("set-cookie") === null),
    ).toBe(true);
    for (let use = 0; use < 5; use += 1)
      expect(
        (
          await bootstrap(
            request("/api/v1/bootstrap", {
              headers: { cookie: "lifemaxing_session=" + token },
            }),
          )
        ).status,
      ).toBe(200);
    expect(
      (
        await bootstrap(
          request("/api/v1/bootstrap", {
            headers: { cookie: "lifemaxing_session=" + token },
          }),
        )
      ).status,
    ).toBe(401);

    const expiringLogin = await loginRequest();
    const expiringToken = cookieValue(expiringLogin);
    expect(
      (
        await bootstrap(
          request("/api/v1/bootstrap", {
            headers: { cookie: "lifemaxing_session=" + expiringToken },
          }),
        )
      ).status,
    ).toBe(200);
    (active.clock as FixedClock).set(new Date("2026-09-03T12:00:10.001Z"));
    expect(
      (
        await bootstrap(
          request("/api/v1/bootstrap", {
            headers: { cookie: "lifemaxing_session=" + expiringToken },
          }),
        )
      ).status,
    ).toBe(401);

    expect(
      (
        await logout(
          request("/api/v1/auth/session", {
            method: "DELETE",
            headers: {
              origin: "https://attacker.test",
              cookie: `lifemaxing_session=${rotated}`,
              "x-csrf-token": csrf,
            },
          }),
        )
      ).status,
    ).toBe(403);

    const signedOut = await logout(
      request("/api/v1/auth/session", {
        method: "DELETE",
        headers: {
          origin: ORIGIN,
          cookie: `lifemaxing_session=${rotated}`,
          "x-csrf-token": csrf,
        },
      }),
    );
    expect(signedOut.status).toBe(204);
    expect(signedOut.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(
      (
        await bootstrap(
          request("/api/v1/bootstrap", {
            headers: { cookie: `lifemaxing_session=${rotated}` },
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("renews idle expiry without extending absolute expiry", async () => {
    active = installRuntime();
    await createOwner(active.auth);
    let token = cookieValue(await loginRequest());
    (active.clock as FixedClock).set(new Date("2026-09-03T12:29:00Z"));
    const renewed = await bootstrap(
      request("/api/v1/bootstrap", {
        headers: { cookie: `lifemaxing_session=${token}` },
      }),
    );
    expect(renewed.status).toBe(200);
    token = cookieValue(renewed);
    (active.clock as FixedClock).set(new Date("2026-09-03T12:58:00Z"));
    expect(
      (
        await bootstrap(
          request("/api/v1/bootstrap", {
            headers: { cookie: `lifemaxing_session=${token}` },
          }),
        )
      ).status,
    ).toBe(200);

    const idleSession = await active.auth.createSession(PASSWORD);
    (active.clock as FixedClock).set(new Date("2026-09-03T13:28:00Z"));
    expect(
      (
        await bootstrap(
          request("/api/v1/bootstrap", {
            headers: { cookie: `lifemaxing_session=${idleSession!.token}` },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      active.connection.sqlite
        .prepare(
          "SELECT last_used_at FROM session WHERE created_at='2026-09-03T12:58:00.000Z'",
        )
        .pluck()
        .get(),
    ).toBe("2026-09-03T12:58:00.000Z");

    (active.clock as FixedClock).set(new Date("2026-09-03T12:58:00Z"));
    const absoluteSession = await active.auth.createSession(PASSWORD);
    active.connection.sqlite
      .prepare(
        "UPDATE session SET idle_expires_at=?,absolute_expires_at=? WHERE token_hash<>'' ORDER BY rowid DESC LIMIT 1",
      )
      .run("2026-09-04T01:00:00Z", "2026-09-03T13:00:00Z");
    (active.clock as FixedClock).set(new Date("2026-09-03T13:00:00Z"));
    expect(
      (
        await bootstrap(
          request("/api/v1/bootstrap", {
            headers: { cookie: `lifemaxing_session=${absoluteSession!.token}` },
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("rate limits by source without letting one source lock out the owner", async () => {
    active = installRuntime();
    await createOwner(active.auth);
    expect((await loginRequest("wrong-value")).status).toBe(401);
    expect((await loginRequest("wrong-value")).status).toBe(429);
    (active.clock as FixedClock).set(new Date("2026-09-03T12:00:00.500Z"));
    expect((await loginRequest(PASSWORD, "192.0.2.11")).status).toBe(200);
    expect((await loginRequest("wrong-value")).status).toBe(401);
  });

  it("bounds source limiter state and collapses malformed forwarding values", async () => {
    active = installRuntime();
    await createOwner(active.auth);
    active.loginLimiter = new LoginRateLimiter(active.clock, 2);
    expect((await loginRequest("wrong-value", "192.0.2.20")).status).toBe(401);
    expect((await loginRequest("wrong-value", "192.0.2.21")).status).toBe(401);
    expect((await loginRequest("wrong-value", "192.0.2.22")).status).toBe(401);
    expect((await loginRequest(PASSWORD, "192.0.2.20")).status).toBe(200);

    expect((await loginRequest("wrong-value", "not-an-ip")).status).toBe(401);
    expect((await loginRequest(PASSWORD, "also-not-an-ip")).status).toBe(429);
  });

  it("enforces actual streamed bytes with absent or false Content-Length", async () => {
    active = installRuntime();
    await createOwner(active.auth);
    const oversized = JSON.stringify({ password: "x".repeat(MAX_BODY_BYTES) });
    for (const headers of [
      new Headers({ origin: ORIGIN, "content-type": "application/json" }),
      new Headers({
        origin: ORIGIN,
        "content-type": "application/json",
        "content-length": "10",
      }),
      new Headers({
        origin: ORIGIN,
        "content-type": "application/json",
        "content-length": String(MAX_BODY_BYTES + 1),
      }),
    ]) {
      expect(
        (
          await login(
            request("/api/v1/auth/session", {
              method: "POST",
              headers,
              body: oversized,
            }),
          )
        ).status,
      ).toBe(413);
      (active.clock as FixedClock).set(
        new Date(active.clock.now().getTime() + 5_000),
      );
    }
    expect(
      (
        await login(
          request("/api/v1/auth/session", {
            method: "POST",
            headers: {
              origin: ORIGIN,
              "content-type": "application/json",
              "content-length": "invalid",
            },
            body: JSON.stringify({ password: PASSWORD }),
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("returns 422 for bad onboarding links, rolls back, and rotates", async () => {
    active = installRuntime();
    await createOwner(active.auth);
    const signedIn = await loginRequest();
    const token = cookieValue(signedIn);
    const csrf = ((await signedIn.json()) as { csrfToken: string }).csrfToken;
    const invalid = structuredClone(validOnboarding);
    invalid.chapter.milestones[0]!.aspectIndexes = [0, 0, 5];

    expect(
      (
        await completeOnboarding(
          request("/api/v1/onboarding/complete", {
            method: "POST",
            headers: {
              origin: "https://attacker.test",
              cookie: `lifemaxing_session=${token}`,
              "x-csrf-token": csrf,
              "content-type": "application/json",
            },
            body: JSON.stringify(invalid),
          }),
        )
      ).status,
    ).toBe(403);

    const response = await completeOnboarding(
      request("/api/v1/onboarding/complete", {
        method: "POST",
        headers: {
          origin: ORIGIN,
          cookie: `lifemaxing_session=${token}`,
          "x-csrf-token": csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify(invalid),
      }),
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("set-cookie")).toContain("lifemaxing_session=");
    expect(
      active.connection.sqlite
        .prepare("SELECT count(*) FROM character_aspect")
        .pluck()
        .get(),
    ).toBe(0);
    expect(
      active.connection.sqlite
        .prepare("SELECT setup_completed FROM owner")
        .pluck()
        .get(),
    ).toBe(0);
  });
});
