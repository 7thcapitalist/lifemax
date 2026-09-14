import { LoginRateLimiter } from "@/application/auth/rate-limit";
import { AuthService } from "@/application/auth/service";
import { BootstrapService } from "@/application/bootstrap/service";
import { CharacterService } from "@/application/character/service";
import { ChronicleService } from "@/application/chronicle/service";
import { OnboardingService } from "@/application/onboarding/service";
import { PlanningService } from "@/application/planning/service";
import { TodayService } from "@/application/today/service";
import { GameService } from "@/application/game/service";
import { DeterministicBriefingGenerator } from "@/domain/briefing/generator";
import { DeterministicMissionGenerator } from "@/domain/game-master/generator";
import {
  IntlCalendarService,
  SystemClock,
} from "@/infrastructure/clock/system";
import { parseConfig } from "@/infrastructure/config/env";
import { openDatabase } from "@/infrastructure/db/client";
import { validateMigrationHistory } from "@/infrastructure/db/migrate";
import { SqliteRepositories } from "@/infrastructure/db/repositories";
import { SqliteGameRepositories } from "@/infrastructure/db/repositories-game";
import path from "node:path";

function createRuntime() {
  const config = parseConfig(process.env);
  const connection = openDatabase(config);
  try {
    validateMigrationHistory(connection, path.resolve("migrations"));
  } catch (error) {
    connection.sqlite.close();
    throw error;
  }
  const clock = new SystemClock();
  const calendar = new IntlCalendarService();
  const repositories = new SqliteRepositories(connection);
  const gameRepositories = new SqliteGameRepositories(connection);
  const briefingGenerator = new DeterministicBriefingGenerator();
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
      repositories.character,
      clock,
      calendar,
      config.SETUP_MODE,
    ),
    today: new TodayService(
      repositories.owners,
      repositories.character,
      repositories.planning,
      clock,
      calendar,
    ),
    planning: new PlanningService(
      repositories.owners,
      repositories.character,
      repositories.planning,
      repositories.transactions,
      clock,
      calendar,
      briefingGenerator,
    ),
    character: new CharacterService(
      repositories.owners,
      repositories.character,
      gameRepositories,
    ),
    chronicle: new ChronicleService(repositories.planning),
    game: new GameService(
      repositories.owners,
      gameRepositories,
      clock,
      calendar,
      new DeterministicMissionGenerator(),
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
