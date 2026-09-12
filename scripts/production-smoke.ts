import fs from "node:fs";
import { onboardingSchema } from "@/contracts/http";

const baseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
const passwordFile = process.env.SMOKE_PASSWORD_FILE;
if (!baseUrl || !passwordFile)
  throw new Error("SMOKE_BASE_URL and SMOKE_PASSWORD_FILE are required");
const origin = new URL(baseUrl).origin;
const loopbackHttp =
  process.env.SMOKE_ALLOW_LOOPBACK_HTTP === "1" &&
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname);
if (origin !== baseUrl || (!origin.startsWith("https://") && !loopbackHttp))
  throw new Error("SMOKE_BASE_URL must be a canonical HTTPS origin");
const passwordStat = fs.lstatSync(passwordFile);
if (
  !passwordStat.isFile() ||
  passwordStat.isSymbolicLink() ||
  (passwordStat.mode & 0o077) !== 0
)
  throw new Error("SMOKE_PASSWORD_FILE must be a regular owner-only file");
const password = fs.readFileSync(passwordFile, "utf8").replace(/\r?\n$/, "");

let cookie: string | undefined;
function retainSession(response: Response) {
  const header = response.headers.get("set-cookie");
  const value = header?.match(/(?:^|,\s*)(lifemaxing_session=[^;]+)/)?.[1];
  if (value) cookie = value;
}

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    redirect: "manual",
  });
  retainSession(response);
  return response;
}

async function json(response: Response) {
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      `Smoke request failed: ${response.status} ${String(body.code)}`,
    );
  return body;
}

async function main() {
  const initial = await json(await request("/api/v1/bootstrap"));
  if (initial.aiMode !== "disabled" || initial.hasOwner !== true)
    throw new Error(
      "Smoke deployment must be privately provisioned with AI disabled",
    );

  const signedIn = await json(
    await request("/api/v1/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  );
  if (!signedIn.csrfToken || !cookie)
    throw new Error("Sign-in did not create a session");

  let authenticated = await json(await request("/api/v1/bootstrap"));
  const csrfToken = String(authenticated.csrfToken);
  if (authenticated.authenticated !== true || !csrfToken)
    throw new Error("Authenticated bootstrap failed");

  const owner = authenticated.owner as { setupCompleted?: boolean };
  if (!owner.setupCompleted) {
    const start = new Date();
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 42);
    const input = onboardingSchema.parse({
      becomingStatement: "Use LifeMax consistently and privately.",
      aspects: ["Focus", "Recovery", "Relationships", "Adventure"].map(
        (name, index) => ({
          name,
          definition: `${name} in daily life`,
          desiredIdentity: `I practice ${name.toLowerCase()} deliberately`,
          emphasis: index === 0 ? "active" : "maintenance",
        }),
      ),
      northStars: [{ title: "Daily use", motivation: "Learn from real use" }],
      chapter: {
        title: "First six weeks",
        intent: "Build a calm daily practice",
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        milestones: [
          {
            title: "Complete the first week",
            doneCondition: "Use LifeMax on seven days",
            aspectIndexes: [0],
          },
        ],
      },
      guardrails: [
        { category: "recovery", statement: "Protect enough rest to continue" },
      ],
    });
    await json(
      await request("/api/v1/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(input),
      }),
    );
  }

  authenticated = await json(await request("/api/v1/bootstrap"));
  if (
    authenticated.authenticated !== true ||
    !(authenticated.owner as { setupCompleted?: boolean }).setupCompleted
  )
    throw new Error("Onboarding did not persist");
  await json(await request("/api/v1/today"));
  const todayPage = await request("/today");
  if (!todayPage.ok) throw new Error(`/today failed: ${todayPage.status}`);
  process.stdout.write(
    "Production smoke passed: bootstrap, sign-in, onboarding, persistence, and /today.\n",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Production smoke failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
