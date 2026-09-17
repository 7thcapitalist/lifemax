import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  applyRotatedSession,
  errorResponse,
  handledApiError,
  requireSession,
} from "@/app/api/http";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const app = getRuntime();
  const auth = requireSession(request, app.auth);
  if (!auth)
    return errorResponse(401, "UNAUTHENTICATED", "Authentication required.");
  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return applyRotatedSession(
      errorResponse(422, "VALIDATION", "Invalid local date."),
      auth,
      app.config.APP_ORIGIN,
    );
  try {
    return applyRotatedSession(
      NextResponse.json(app.game.streak(auth.ownerId, date)),
      auth,
      app.config.APP_ORIGIN,
    );
  } catch (error) {
    return handledApiError(error, auth, app.config.APP_ORIGIN);
  }
}
