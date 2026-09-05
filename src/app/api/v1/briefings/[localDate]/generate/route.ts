import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  applyRotatedSession,
  errorResponse,
  requireSession,
  sameOrigin,
} from "@/app/api/http";
import { DomainError } from "@/domain/shared/errors";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ localDate: string }> },
) {
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
  const { localDate } = await context.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate))
    return applyRotatedSession(
      errorResponse(422, "VALIDATION", "Invalid local date."),
      auth,
      app.config.APP_ORIGIN,
    );
  try {
    const result = app.planning.generateBriefing(auth.ownerId, localDate);
    return applyRotatedSession(
      NextResponse.json(result),
      auth,
      app.config.APP_ORIGIN,
    );
  } catch (error) {
    if (error instanceof DomainError)
      return applyRotatedSession(
        errorResponse(409, error.code, error.message),
        auth,
        app.config.APP_ORIGIN,
      );
    return applyRotatedSession(
      errorResponse(500, "BRIEFING_FAILED", "Briefing could not be generated."),
      auth,
      app.config.APP_ORIGIN,
    );
  }
}
