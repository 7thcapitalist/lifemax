import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, isNull } from "drizzle-orm";
import type { Clock } from "@/application/ports/time";
import { credentials, owners, sessions } from "@/infrastructure/db/schema";
import type { DatabaseConnection } from "@/infrastructure/db/client";
import { newId } from "@/domain/shared/id";

const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const dummyHashPromise = hash("not-a-real-owner-password", {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

export class AuthService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly clock: Clock,
  ) {}

  async setupOwner(input: {
    displayName: string;
    timezone: string;
    password: string;
  }) {
    const now = this.clock.now().toISOString();
    const passwordHash = await hash(input.password, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const ownerId = newId(this.clock.now().getTime());
    this.connection.sqlite.transaction(() => {
      const count = this.connection.sqlite
        .prepare("SELECT count(*) AS count FROM owner")
        .get() as { count: number };
      if (count.count !== 0) throw new Error("SETUP_CLOSED");
      this.connection.db
        .insert(owners)
        .values({
          id: ownerId,
          displayName: input.displayName,
          timezone: input.timezone,
          becomingStatement: "",
          setupCompleted: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      this.connection.db
        .insert(credentials)
        .values({ ownerId, passwordHash, changedAt: now })
        .run();
    })();
    return { ownerId };
  }

  async createSession(password: string) {
    const row = this.connection.sqlite
      .prepare(
        "SELECT o.id AS ownerId, c.password_hash AS passwordHash FROM owner o JOIN credential c ON c.owner_id=o.id LIMIT 1",
      )
      .get() as { ownerId: string; passwordHash: string } | undefined;
    const passwordHash = row?.passwordHash ?? (await dummyHashPromise);
    const valid = await verify(passwordHash, password);
    if (!row || !valid) return null;
    const now = this.clock.now();
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    this.connection.db
      .insert(sessions)
      .values({
        id: newId(now.getTime()),
        ownerId: row.ownerId,
        tokenHash: digest(token),
        csrfHash: digest(csrfToken),
        createdAt: now.toISOString(),
        lastUsedAt: now.toISOString(),
        idleExpiresAt: new Date(now.getTime() + IDLE_MS).toISOString(),
        absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS).toISOString(),
      })
      .run();
    return { token, csrfToken, ownerId: row.ownerId };
  }

  authenticate(token: string | undefined, csrfToken?: string) {
    if (!token) return null;
    const now = this.clock.now();
    const row = this.connection.db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.tokenHash, digest(token)), isNull(sessions.revokedAt)),
      )
      .get();
    if (
      !row ||
      new Date(row.idleExpiresAt) <= now ||
      new Date(row.absoluteExpiresAt) <= now
    )
      return null;
    if (csrfToken !== undefined && digest(csrfToken) !== row.csrfHash)
      return null;
    const idleExpiresAt = new Date(
      Math.min(
        now.getTime() + IDLE_MS,
        new Date(row.absoluteExpiresAt).getTime(),
      ),
    ).toISOString();
    this.connection.db
      .update(sessions)
      .set({ lastUsedAt: now.toISOString(), idleExpiresAt })
      .where(eq(sessions.id, row.id))
      .run();
    return { ownerId: row.ownerId };
  }

  revoke(token: string | undefined): void {
    if (!token) return;
    this.connection.db
      .update(sessions)
      .set({ revokedAt: this.clock.now().toISOString() })
      .where(eq(sessions.tokenHash, digest(token)))
      .run();
  }
}
