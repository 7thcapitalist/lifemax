import type { Clock } from "@/application/ports/time";

type Entry = { failures: number; blockedUntil: number };
export const MAX_LOGIN_RATE_LIMIT_SOURCES = 1_024;

export class LoginRateLimiter {
  private readonly entries = new Map<string, Entry>();
  constructor(
    private readonly clock: Clock,
    private readonly maxSources = MAX_LOGIN_RATE_LIMIT_SOURCES,
  ) {
    if (!Number.isSafeInteger(maxSources) || maxSources < 1)
      throw new Error("LOGIN_RATE_LIMIT_SOURCE_CAP_INVALID");
  }

  canAttempt(key: string): boolean {
    return (
      (this.entries.get(key)?.blockedUntil ?? 0) <= this.clock.now().getTime()
    );
  }
  recordFailure(key: string): void {
    const prior = this.entries.get(key) ?? { failures: 0, blockedUntil: 0 };
    const failures = Math.min(prior.failures + 1, 10);
    const delay = Math.min(2 ** failures * 250, 60_000);
    // Refresh insertion order and evict the least-recently-failed source. This
    // bounds memory even when a proxy receives attacker-controlled source churn.
    this.entries.delete(key);
    this.entries.set(key, {
      failures,
      blockedUntil: this.clock.now().getTime() + delay,
    });
    if (this.entries.size > this.maxSources) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
  clear(key: string): void {
    this.entries.delete(key);
  }
}
