import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type {
  OwnerRepository,
  SessionRepository,
  TransactionPort,
} from "@/application/ports/persistence";
import type { Clock } from "@/application/ports/time";
import { newId } from "@/domain/shared/id";

const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const PREVIOUS_TOKEN_GRACE_MS = 10_000;
export const PREVIOUS_TOKEN_MAX_USES = 8;
export const PRIOR_TOKEN_MAX_GENERATIONS = 3;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const safeDigestEqual = (left: string, right: string) =>
  timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
const dummyHashPromise = hash("not-a-real-owner-password", {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

export type AuthenticatedSession = {
  ownerId: string;
  rotatedToken?: string;
};

export class AuthService {
  constructor(
    private readonly owners: OwnerRepository,
    private readonly sessions: SessionRepository,
    private readonly transactions: TransactionPort,
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
    this.transactions.run(() => {
      if (this.owners.count() !== 0) throw new Error("SETUP_CLOSED");
      this.owners.createWithCredential({
        id: ownerId,
        displayName: input.displayName,
        timezone: input.timezone,
        passwordHash,
        now,
      });
    });
    return { ownerId };
  }

  async createSession(password: string) {
    const row = this.owners.findCredential();
    const passwordHash = row?.passwordHash ?? (await dummyHashPromise);
    const valid = await verify(passwordHash, password);
    if (!row || !valid) return null;
    const now = this.clock.now();
    const token = randomBytes(32).toString("base64url");
    const sessionId = newId(now.getTime());
    const csrfToken = digest(`csrf:${sessionId}`);
    this.sessions.create({
      id: sessionId,
      ownerId: row.ownerId,
      tokenHash: digest(token),
      csrfHash: digest(csrfToken),
      now: now.toISOString(),
      idleExpiresAt: new Date(now.getTime() + IDLE_MS).toISOString(),
      absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS).toISOString(),
    });
    return { token, csrfToken, ownerId: row.ownerId };
  }

  authenticate(
    token: string | undefined,
    csrfToken?: string,
    rotate = true,
  ): AuthenticatedSession | null {
    if (!token) return null;
    const now = this.clock.now();
    const tokenHash = digest(token);
    const row = this.sessions.findByTokenHash(tokenHash);
    if (
      !row ||
      row.revokedAt ||
      new Date(row.idleExpiresAt) <= now ||
      new Date(row.absoluteExpiresAt) <= now ||
      (row.tokenMatch === "prior" &&
        (!row.matchedTokenExpiresAt ||
          new Date(row.matchedTokenExpiresAt) <= now ||
          !row.matchedTokenUsesRemaining ||
          row.matchedTokenUsesRemaining <= 0))
    )
      return null;
    if (
      csrfToken !== undefined &&
      !safeDigestEqual(digest(csrfToken), row.csrfHash)
    )
      return null;
    const idleExpiresAt = new Date(
      Math.min(
        now.getTime() + IDLE_MS,
        new Date(row.absoluteExpiresAt).getTime(),
      ),
    ).toISOString();
    if (!rotate) return { ownerId: row.ownerId };
    if (row.tokenMatch === "prior") {
      if (
        !this.sessions.usePriorToken(
          row.id,
          tokenHash,
          now.toISOString(),
          idleExpiresAt,
        )
      )
        return null;
      return { ownerId: row.ownerId };
    }
    const rotatedToken = randomBytes(32).toString("base64url");
    if (
      !this.sessions.rotate(
        row.id,
        tokenHash,
        digest(rotatedToken),
        now.toISOString(),
        idleExpiresAt,
        new Date(now.getTime() + PREVIOUS_TOKEN_GRACE_MS).toISOString(),
        PREVIOUS_TOKEN_MAX_USES,
        PRIOR_TOKEN_MAX_GENERATIONS,
      )
    ) {
      const raced = this.sessions.findByTokenHash(tokenHash);
      if (
        !raced ||
        raced.tokenMatch !== "prior" ||
        raced.revokedAt ||
        new Date(raced.idleExpiresAt) <= now ||
        new Date(raced.absoluteExpiresAt) <= now ||
        !this.sessions.usePriorToken(
          raced.id,
          tokenHash,
          now.toISOString(),
          idleExpiresAt,
        )
      )
        return null;
      return { ownerId: raced.ownerId };
    }
    return { ownerId: row.ownerId, rotatedToken };
  }

  refreshCsrf(token: string | undefined): string | null {
    if (!token) return null;
    const row = this.sessions.findByTokenHash(digest(token));
    if (!row || row.revokedAt) return null;
    const csrfToken = digest(`csrf:${row.id}`);
    return safeDigestEqual(digest(csrfToken), row.csrfHash) ? csrfToken : null;
  }

  revoke(token: string | undefined): void {
    if (!token) return;
    this.sessions.revoke(digest(token), this.clock.now().toISOString());
  }
}
