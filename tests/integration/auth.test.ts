import { describe, expect, it } from "vitest";
import { AuthService } from "@/application/auth/service";
import { SqliteRepositories } from "@/infrastructure/db/repositories";
import { FixedClock, migratedDatabase } from "../helpers";

describe("one-owner authentication and sessions", () => {
  it("closes setup, hashes secrets, validates CSRF, expires, and revokes sessions", async () => {
    const connection = migratedDatabase();
    const clock = new FixedClock(new Date("2026-09-03T12:00:00Z"));
    const repositories = new SqliteRepositories(connection);
    const auth = new AuthService(
      repositories.owners,
      repositories.sessions,
      repositories.transactions,
      clock,
    );
    await auth.setupOwner({
      displayName: "Synthetic Owner",
      timezone: "UTC",
      password: "synthetic-passphrase-only",
    });
    await expect(
      auth.setupOwner({
        displayName: "Other",
        timezone: "UTC",
        password: "another-synthetic-passphrase",
      }),
    ).rejects.toThrow("SETUP_CLOSED");
    const stored = connection.sqlite
      .prepare("SELECT password_hash AS hash FROM credential")
      .get() as { hash: string };
    expect(stored.hash).not.toContain("synthetic-passphrase");
    expect(await auth.createSession("wrong-synthetic-value")).toBeNull();
    const session = await auth.createSession("synthetic-passphrase-only");
    expect(session).not.toBeNull();
    expect(
      connection.sqlite.prepare("SELECT token_hash FROM session").pluck().get(),
    ).not.toBe(session!.token);
    expect(auth.authenticate(session!.token, "wrong-csrf")).toBeNull();
    const authenticated = auth.authenticate(session!.token, session!.csrfToken);
    expect(authenticated?.ownerId).toBe(session!.ownerId);
    expect(authenticated?.rotatedToken).toBeTruthy();
    expect(auth.authenticate(session!.token)).toBeNull();
    const renewed = auth.authenticate(authenticated!.rotatedToken);
    expect(renewed?.ownerId).toBe(session!.ownerId);
    auth.revoke(renewed!.rotatedToken);
    clock.set(new Date("2026-09-03T12:31:00Z"));
    expect(auth.authenticate(session!.token)).toBeNull();
    expect(auth.authenticate(session!.token)).toBeNull();
    connection.sqlite.close();
  });
});
