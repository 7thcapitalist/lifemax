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
  context: { params: Promise<{ id: string }> },
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
  const { id } = await context.params;
  try {
    const result = app.planning.declineQuest(auth.ownerId, id);
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
      errorResponse(500, "QUEST_FAILED", "Quest could not be declined."),
      auth,
      app.config.APP_ORIGIN,
    );
  }
}
