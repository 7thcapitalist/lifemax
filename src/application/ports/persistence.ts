import type { OnboardingInput } from "@/contracts/http";

export type OwnerRecord = {
  id: string;
  displayName: string;
  timezone: string;
  becomingStatement: string;
  setupCompleted: boolean;
  version: number;
};

export type StoredSession = {
  id: string;
  ownerId: string;
  tokenHash: string;
  csrfHash: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
};

export interface TransactionPort {
  run<T>(work: () => T): T;
}

export interface OwnerRepository {
  count(): number;
  createWithCredential(input: {
    id: string;
    displayName: string;
    timezone: string;
    passwordHash: string;
    now: string;
  }): void;
  findCredential(): { ownerId: string; passwordHash: string } | undefined;
  findById(ownerId: string): OwnerRecord | undefined;
  completeOnboarding(
    ownerId: string,
    input: OnboardingInput,
    now: string,
  ): void;
}

export interface SessionRepository {
  create(input: {
    id: string;
    ownerId: string;
    tokenHash: string;
    csrfHash: string;
    now: string;
    idleExpiresAt: string;
    absoluteExpiresAt: string;
  }): void;
  findByTokenHash(tokenHash: string): StoredSession | undefined;
  rotate(
    id: string,
    expectedTokenHash: string,
    nextTokenHash: string,
    now: string,
    idleExpiresAt: string,
  ): boolean;
  revoke(tokenHash: string, now: string): void;
}
