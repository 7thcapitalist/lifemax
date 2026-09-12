import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  errorResponse,
  handledApiError,
  parseJson,
  requireSession,
  sameOrigin,
  applyRotatedSession,
} from "@/app/api/http";
import { dailyPlanSchema } from "@/contracts/game";
import { runtime as getRuntime } from "@/infrastructure/runtime";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const app = getRuntime();
  if (!sameOrigin(request, app.config.APP_ORIGIN))
    return errorResponse(403, "ORIGIN", "Request origin is not allowed.");
  const auth = requireSession(request, app.auth, true);
  if (!auth)
    return errorResponse(
      401,
      "UNAUTHENTICATED",
      "Authentication and CSRF validation required.",
    );
  try {
    return applyRotatedSession(
      NextResponse.json(
        app.game.dailyPlan(
          auth.ownerId,
          await parseJson(request, dailyPlanSchema),
        ),
        { status: 201 },
      ),
      auth,
      app.config.APP_ORIGIN,
    );
  } catch (error) {
    return handledApiError(error, auth, app.config.APP_ORIGIN);
  }
}
