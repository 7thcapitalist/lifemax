import type { Clock } from "@/application/ports/time";

type Entry = { failures: number; blockedUntil: number };
export class LoginRateLimiter {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly clock: Clock) {}

  canAttempt(key: string): boolean {
    return (
      (this.entries.get(key)?.blockedUntil ?? 0) <= this.clock.now().getTime()
    );
  }
  recordFailure(key: string): void {
    const prior = this.entries.get(key) ?? { failures: 0, blockedUntil: 0 };
    const failures = Math.min(prior.failures + 1, 10);
    const delay = Math.min(2 ** failures * 250, 60_000);
    this.entries.set(key, {
      failures,
      blockedUntil: this.clock.now().getTime() + delay,
    });
  }
  clear(key: string): void {
    this.entries.delete(key);
  }
}
