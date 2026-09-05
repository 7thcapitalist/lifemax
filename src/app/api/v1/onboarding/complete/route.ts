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
import { onboardingSchema } from "@/contracts/http";
import { DomainError } from "@/domain/shared/errors";
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
    const input = await parseJson(request, onboardingSchema);
    app.onboarding.complete(auth.ownerId, input);
    return applyRotatedSession(
      NextResponse.json({ completed: true }),
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
          "Invalid onboarding request.",
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
      errorResponse(
        500,
        "ONBOARDING_FAILED",
        "Onboarding could not be completed.",
      ),
      auth,
      app.config.APP_ORIGIN,
    );
  }
}
