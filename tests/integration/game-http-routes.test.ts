import { NextRequest } from "next/server";
import { hash } from "@node-rs/argon2";
import { afterEach, describe, expect, it } from "vitest";
import { AuthService } from "@/application/auth/service";
import { CharacterService } from "@/application/character/service";
import { GameService } from "@/application/game/service";
import { GET as getCharacter } from "@/app/api/v1/character/route";
import {
  GET as listMissions,
  POST as createMission,
} from "@/app/api/v1/missions/route";
import { PATCH as updateMission } from "@/app/api/v1/missions/[id]/route";
import { POST as completeMission } from "@/app/api/v1/missions/[id]/complete/route";
import { POST as dailyPlan } from "@/app/api/v1/game-master/daily-plan/route";
import { GET as listQuests } from "@/app/api/v1/quests/route";
import {
  GET as listChapters,
  POST as createChapter,
} from "@/app/api/v1/chapters/route";
import {
  GET as getChapter,
  PATCH as updateChapter,
} from "@/app/api/v1/chapters/[id]/route";
import { GET as listAchievements } from "@/app/api/v1/achievements/route";
import {
  GET as listRewards,
  POST as createReward,
} from "@/app/api/v1/rewards/route";
import { PATCH as updateReward } from "@/app/api/v1/rewards/[id]/route";
import { POST as redeemReward } from "@/app/api/v1/rewards/[id]/redeem/route";
import {
  GET as listAcademics,
  POST as createAcademic,
} from "@/app/api/v1/academics/route";
import {
  DELETE as deleteAcademic,
  GET as getAcademic,
  PATCH as updateAcademic,
} from "@/app/api/v1/academics/[id]/route";
import { DeterministicMissionGenerator } from "@/domain/game-master/generator";
import { IntlCalendarService } from "@/infrastructure/clock/system";
import { SqliteRepositories } from "@/infrastructure/db/repositories";
import { SqliteGameRepositories } from "@/infrastructure/db/repositories-game";
import { installTestRuntime } from "@/infrastructure/runtime";
import { FixedClock, migratedDatabase } from "../helpers";

const origin = "https://lifemaxing.test";
const now = "2026-09-09T12:00:00.000Z";
type RouteContext = { params: Promise<{ id: string }> };
type Handler =
  | ((request: NextRequest) => Promise<Response>)
  | ((request: NextRequest, context: RouteContext) => Promise<Response>);

describe("game HTTP routes", () => {
  const connection = migratedDatabase();
  const base = new SqliteRepositories(connection);
  const gameRepository = new SqliteGameRepositories(connection);
  const clock = new FixedClock(new Date(now));
  const calendar = new IntlCalendarService();
  const auth = new AuthService(
    base.owners,
    base.sessions,
    base.transactions,
    clock,
  );
  const game = new GameService(
    base.owners,
    gameRepository,
    clock,
    calendar,
    new DeterministicMissionGenerator(),
  );
  const ownerId = "00000000-0000-4000-8000-000000000010";

  afterEach(() => {
    connection.sqlite.close();
    installTestRuntime(undefined);
  });

  it("serves every game route family with typed owner-scoped JSON", async () => {
    base.owners.createWithCredential({
      id: ownerId,
      displayName: "Owner",
      timezone: "UTC",
      passwordHash: await hash("test-password"),
      now,
    });
    base.owners.completeOnboarding(
      ownerId,
      {
        becomingStatement: "Become steady",
        aspects: ["Craft", "Recovery", "Connection", "Exploration"].map(
          (name) => ({
            name,
            definition: `${name} definition`,
            desiredIdentity: `${name} identity`,
            emphasis: "active" as const,
          }),
        ),
        northStars: [],
        chapter: {
          title: "Active chapter",
          intent: "Practice the loop",
          startDate: "2026-09-01",
          endDate: "2026-10-01",
          milestones: [],
        },
        guardrails: [{ category: "recovery", statement: "Protect rest" }],
      },
      now,
    );
    installTestRuntime({
      config: {
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: 3000,
        APP_ORIGIN: origin,
        SETUP_MODE: "disabled",
        DATABASE_PATH: ":memory:",
        AI_MODE: "disabled",
      },
      connection,
      clock,
      repositories: base,
      loginLimiter: undefined as never,
      auth,
      onboarding: undefined as never,
      bootstrap: undefined as never,
      today: undefined as never,
      planning: undefined as never,
      character: new CharacterService(
        base.owners,
        base.character,
        gameRepository,
      ),
      chronicle: undefined as never,
      game,
    });

    const session = await auth.createSession("test-password");
    expect(session).not.toBeNull();
    let token = session!.token;
    const csrf = session!.csrfToken;
    const call = async (
      handler: Handler,
      path: string,
      body?: unknown,
      context?: unknown,
    ) => {
      const nextRequest = new NextRequest(`${origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin,
          cookie: `lifemaxing_session=${token}`,
          "x-csrf-token": csrf,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const response = context
        ? await (
            handler as (
              request: NextRequest,
              context: RouteContext,
            ) => Promise<Response>
          )(nextRequest, context as RouteContext)
        : await (handler as (request: NextRequest) => Promise<Response>)(
            nextRequest,
          );
      const rotated = response.headers
        .get("set-cookie")
        ?.match(/lifemaxing_session=([^;]+)/)?.[1];
      if (rotated) token = rotated;
      return response;
    };
    const mutate = async (
      handler: Handler,
      path: string,
      method: "POST" | "PATCH" | "DELETE",
      body: unknown,
      context?: unknown,
    ) => {
      const nextRequest = new NextRequest(`${origin}${path}`, {
        method,
        headers: {
          origin,
          cookie: `lifemaxing_session=${token}`,
          "x-csrf-token": csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const response = context
        ? await (
            handler as (
              request: NextRequest,
              context: RouteContext,
            ) => Promise<Response>
          )(nextRequest, context as RouteContext)
        : await (handler as (request: NextRequest) => Promise<Response>)(
            nextRequest,
          );
      const rotated = response.headers
        .get("set-cookie")
        ?.match(/lifemaxing_session=([^;]+)/)?.[1];
      if (rotated) token = rotated;
      return response;
    };

    expect((await call(getCharacter, "/api/v1/character")).status).toBe(200);
    expect(
      (await call(dailyPlan, "/api/v1/game-master/daily-plan", {})).status,
    ).toBe(201);
    expect((await call(listMissions, "/api/v1/missions")).status).toBe(200);
    expect((await call(listQuests, "/api/v1/quests")).status).toBe(200);

    const attributeId =
      gameRepository.characterSheet(ownerId).attributes[0]!.id;
    const missionResponse = await call(createMission, "/api/v1/missions", {
      title: "Complete route loop",
      doneCondition: "All route assertions pass",
      kind: "progress",
      size: "standard",
      attributeIds: [attributeId],
    });
    expect(missionResponse.status).toBe(201);
    const mission = (await missionResponse.json()) as { id: string };
    expect(
      (
        await mutate(
          updateMission,
          `/api/v1/missions/${mission.id}`,
          "PATCH",
          { status: "accepted" },
          { params: Promise.resolve({ id: mission.id }) },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await mutate(
          completeMission,
          `/api/v1/missions/${mission.id}/complete`,
          "POST",
          { idempotencyKey: "game-http-test" },
          { params: Promise.resolve({ id: mission.id }) },
        )
      ).status,
    ).toBe(200);

    const chapterResponse = await call(createChapter, "/api/v1/chapters", {
      title: "Next chapter",
      intent: "Continue",
      startDate: "2026-10-02",
      endDate: "2026-11-01",
      status: "draft",
    });
    expect(chapterResponse.status).toBe(201);
    const chapter = (await chapterResponse.json()) as { id: string };
    expect((await call(listChapters, "/api/v1/chapters")).status).toBe(200);
    expect(
      (
        await call(getChapter, `/api/v1/chapters/${chapter.id}`, undefined, {
          params: Promise.resolve({ id: chapter.id }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await mutate(
          updateChapter,
          `/api/v1/chapters/${chapter.id}`,
          "PATCH",
          { title: "Next chapter updated" },
          { params: Promise.resolve({ id: chapter.id }) },
        )
      ).status,
    ).toBe(200);
    expect((await call(listAchievements, "/api/v1/achievements")).status).toBe(
      200,
    );

    const rewardResponse = await call(createReward, "/api/v1/rewards", {
      title: "Coffee break",
      coinCost: 2,
    });
    expect(rewardResponse.status).toBe(201);
    const reward = (await rewardResponse.json()) as { id: string };
    expect((await call(listRewards, "/api/v1/rewards")).status).toBe(200);
    expect(
      (
        await mutate(
          updateReward,
          `/api/v1/rewards/${reward.id}`,
          "PATCH",
          { title: "Tea break" },
          { params: Promise.resolve({ id: reward.id }) },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await mutate(
          redeemReward,
          `/api/v1/rewards/${reward.id}/redeem`,
          "POST",
          {},
          { params: Promise.resolve({ id: reward.id }) },
        )
      ).status,
    ).toBe(200);

    const academicResponse = await call(createAcademic, "/api/v1/academics", {
      kind: "owner-defined seminar",
      title: "Systems",
      scoreScale: "narrative",
    });
    expect(academicResponse.status).toBe(201);
    const academic = (await academicResponse.json()) as { id: string };
    expect((await call(listAcademics, "/api/v1/academics")).status).toBe(200);
    expect(
      (
        await call(getAcademic, `/api/v1/academics/${academic.id}`, undefined, {
          params: Promise.resolve({ id: academic.id }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await mutate(
          updateAcademic,
          `/api/v1/academics/${academic.id}`,
          "PATCH",
          { term: "Fall" },
          { params: Promise.resolve({ id: academic.id }) },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await mutate(
          deleteAcademic,
          `/api/v1/academics/${academic.id}`,
          "DELETE",
          {},
          { params: Promise.resolve({ id: academic.id }) },
        )
      ).status,
    ).toBe(204);
  });
});
