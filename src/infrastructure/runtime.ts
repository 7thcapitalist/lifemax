import { LoginRateLimiter } from "@/application/auth/rate-limit";
import { AuthService } from "@/application/auth/service";
import { BootstrapService } from "@/application/bootstrap/service";
import { OnboardingService } from "@/application/onboarding/service";
import {
  IntlCalendarService,
  SystemClock,
} from "@/infrastructure/clock/system";
import { parseConfig } from "@/infrastructure/config/env";
import { openDatabase } from "@/infrastructure/db/client";
import { SqliteRepositories } from "@/infrastructure/db/repositories";

function createRuntime() {
  const config = parseConfig(process.env);
  const connection = openDatabase(config.DATABASE_PATH);
  const clock = new SystemClock();
  const repositories = new SqliteRepositories(connection);
  return {
    config,
    connection,
    clock,
    repositories,
    loginLimiter: new LoginRateLimiter(clock),
    auth: new AuthService(
      repositories.owners,
      repositories.sessions,
      repositories.transactions,
      clock,
    ),
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
}

export type AppRuntime = ReturnType<typeof createRuntime>;
const globalRuntime = globalThis as typeof globalThis & {
  lifemaxingRuntime?: AppRuntime;
};

export function runtime(): AppRuntime {
  globalRuntime.lifemaxingRuntime ??= createRuntime();
  return globalRuntime.lifemaxingRuntime;
}

export function installTestRuntime(value: AppRuntime | undefined): void {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Test runtime injection is disabled outside tests.");
  globalRuntime.lifemaxingRuntime = value;
}
