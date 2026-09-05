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
import { swapQuestSchema } from "@/contracts/http";
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
    const input = await parseJson(request, swapQuestSchema);
    const result = app.planning.swapQuest(auth.ownerId, id, input);
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
          "Invalid swap request.",
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
      errorResponse(500, "QUEST_FAILED", "Quest could not be swapped."),
      auth,
      app.config.APP_ORIGIN,
    );
  }
}
