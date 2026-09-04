import { describe, expect, it } from "vitest";
import { AuthService } from "@/application/auth/service";
import { OnboardingService } from "@/application/onboarding/service";
import { onboardingSchema } from "@/contracts/http";
import { FixedClock, migratedDatabase } from "../helpers";

const input = onboardingSchema.parse({
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
});
describe("onboarding transaction and owner scope", () => {
  it("writes a complete aggregate once and rejects a different owner scope", async () => {
    const connection = migratedDatabase();
    const clock = new FixedClock(new Date("2026-09-03T12:00:00Z"));
    const auth = new AuthService(connection, clock);
    const { ownerId } = await auth.setupOwner({
      displayName: "Synthetic Owner",
      timezone: "UTC",
      password: "synthetic-passphrase-only",
    });
    const service = new OnboardingService(connection, clock);
    service.complete(ownerId, input);
    expect(
      connection.sqlite
        .prepare("SELECT count(*) FROM character_aspect WHERE owner_id=?")
        .pluck()
        .get(ownerId),
    ).toBe(4);
    expect(
      connection.sqlite
        .prepare("SELECT setup_completed FROM owner WHERE id=?")
        .pluck()
        .get(ownerId),
    ).toBe(1);
    expect(() =>
      service.complete("00000000-0000-7000-8000-000000000000", input),
    ).toThrow(/not found/);
    connection.sqlite.close();
  });
});
