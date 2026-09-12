import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  applyRotatedSession,
  errorResponse,
  handledApiError,
  parseJson,
  requireSession,
  sameOrigin,
} from "@/app/api/http";
import { createRewardSchema } from "@/contracts/game";
import { runtime as getRuntime } from "@/infrastructure/runtime";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const app = getRuntime(),
    auth = requireSession(request, app.auth);
  if (!auth)
    return errorResponse(401, "UNAUTHENTICATED", "Authentication required.");
  try {
    return applyRotatedSession(
      NextResponse.json(app.game.listRewards(auth.ownerId)),
      auth,
      app.config.APP_ORIGIN,
    );
  } catch (e) {
    return handledApiError(e, auth, app.config.APP_ORIGIN);
  }
}
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
        app.game.createReward(
          auth.ownerId,
          await parseJson(request, createRewardSchema),
        ),
        { status: 201 },
      ),
      auth,
      app.config.APP_ORIGIN,
    );
  } catch (e) {
    return handledApiError(e, auth, app.config.APP_ORIGIN);
  }
}
