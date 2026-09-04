import { describe, expect, it } from "vitest";
import {
  AuthService,
  PREVIOUS_TOKEN_MAX_USES,
  PRIOR_TOKEN_MAX_GENERATIONS,
} from "@/application/auth/service";
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
    expect(auth.authenticate(session!.token)?.ownerId).toBe(session!.ownerId);
    const renewed = auth.authenticate(authenticated!.rotatedToken);
    expect(renewed?.ownerId).toBe(session!.ownerId);
    auth.revoke(renewed!.rotatedToken);
    clock.set(new Date("2026-09-03T12:31:00Z"));
    expect(auth.authenticate(session!.token)).toBeNull();
    expect(auth.authenticate(session!.token)).toBeNull();
    connection.sqlite.close();
  });

  it("keeps bounded prior generations valid for delayed arrivals and enforces use, expiry, and revocation", async () => {
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

    const delayedSession = await auth.createSession(
      "synthetic-passphrase-only",
    );
    const token0 = delayedSession!.token;
    const token1 = auth.authenticate(token0)!.rotatedToken!;
    const token2 = auth.authenticate(token1)!.rotatedToken!;
    expect(auth.authenticate(token2, undefined, false)?.ownerId).toBe(
      delayedSession!.ownerId,
    );

    const delayed = auth.authenticate(token0);
    expect(delayed?.ownerId).toBe(delayedSession!.ownerId);
    expect(delayed?.rotatedToken).toBeUndefined();
    for (let use = 1; use < PREVIOUS_TOKEN_MAX_USES; use += 1)
      expect(auth.authenticate(token0)?.ownerId).toBe(delayedSession!.ownerId);
    expect(auth.authenticate(token0)).toBeNull();

    clock.set(new Date("2026-09-03T12:00:10.001Z"));
    expect(auth.authenticate(token1)).toBeNull();

    clock.set(new Date("2026-09-03T12:01:00Z"));
    const revokedSession = await auth.createSession(
      "synthetic-passphrase-only",
    );
    const revokedToken1 = auth.authenticate(
      revokedSession!.token,
    )!.rotatedToken!;
    const revokedToken2 = auth.authenticate(revokedToken1)!.rotatedToken!;
    auth.revoke(revokedSession!.token);
    expect(auth.authenticate(revokedSession!.token)).toBeNull();
    expect(auth.authenticate(revokedToken2)).toBeNull();

    const boundedSession = await auth.createSession(
      "synthetic-passphrase-only",
    );
    const generations = [boundedSession!.token];
    for (
      let generation = 0;
      generation < PRIOR_TOKEN_MAX_GENERATIONS + 2;
      generation += 1
    )
      generations.push(auth.authenticate(generations.at(-1))!.rotatedToken!);

    const historyCount = connection.sqlite
      .prepare(
        "SELECT count(*) FROM session_token_history WHERE session_id=(SELECT id FROM session WHERE token_generation=?)",
      )
      .pluck()
      .get(PRIOR_TOKEN_MAX_GENERATIONS + 2);
    expect(historyCount).toBe(PRIOR_TOKEN_MAX_GENERATIONS);
    expect(auth.authenticate(generations[0])).toBeNull();
    expect(auth.authenticate(generations[2])?.ownerId).toBe(
      boundedSession!.ownerId,
    );
    expect(() =>
      connection.sqlite
        .prepare(
          "INSERT INTO session_token_history(session_id,generation,token_hash,expires_at,uses_remaining) SELECT id,100,'synthetic-extra-hash',?,1 FROM session WHERE token_generation=?",
        )
        .run("2026-09-03T12:02:00Z", PRIOR_TOKEN_MAX_GENERATIONS + 2),
    ).toThrow(/session_token_history_generation_limit/);
    connection.sqlite.close();
  });
});
