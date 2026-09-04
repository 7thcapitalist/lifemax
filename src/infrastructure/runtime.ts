import { AuthService } from "@/application/auth/service";
import { OnboardingService } from "@/application/onboarding/service";
import { SystemClock } from "@/infrastructure/clock/system";
import { parseConfig } from "@/infrastructure/config/env";
import { openDatabase } from "@/infrastructure/db/client";

const globalRuntime = globalThis as typeof globalThis & {
  lifemaxingRuntime?: ReturnType<typeof createRuntime>;
};

function createRuntime() {
  const config = parseConfig(process.env);
  const connection = openDatabase(config.DATABASE_PATH);
  const clock = new SystemClock();
  return {
    config,
    connection,
    clock,
    auth: new AuthService(connection, clock),
    onboarding: new OnboardingService(connection, clock),
  };
}

export function runtime() {
  globalRuntime.lifemaxingRuntime ??= createRuntime();
  return globalRuntime.lifemaxingRuntime;
}
