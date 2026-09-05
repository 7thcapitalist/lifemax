import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  applyRotatedSession,
  bodyErrorResponse,
  errorResponse,
  parseJson,
  RequestBodyError,
  requireSession,
  sameOrigin,
} from "@/app/api/http";
import { checkInSchema } from "@/contracts/http";
import { DomainError } from "@/domain/shared/errors";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";

export async function PUT(
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
    const input = await parseJson(request, checkInSchema);
    const result = app.planning.upsertCheckIn(auth.ownerId, localDate, input);
    return applyRotatedSession(
      NextResponse.json(result),
      auth,
      app.config.APP_ORIGIN,
    );
  } catch (error) {
    if (error instanceof RequestBodyError)
      return applyRotatedSession(
        bodyErrorResponse(error),
        auth,
        app.config.APP_ORIGIN,
      );
    if (error instanceof ZodError)
      return applyRotatedSession(
        errorResponse(
          422,
          "VALIDATION",
          "Invalid check-in request.",
          error.flatten().fieldErrors,
        ),
        auth,
        app.config.APP_ORIGIN,
      );
    if (error instanceof DomainError)
      return applyRotatedSession(
        errorResponse(409, error.code, error.message),
        auth,
        app.config.APP_ORIGIN,
      );
    return applyRotatedSession(
      errorResponse(500, "CHECK_IN_FAILED", "Check-in could not be saved."),
      auth,
      app.config.APP_ORIGIN,
    );
  }
}
