import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  applyRotatedSession,
  errorResponse,
  requireSession,
} from "@/app/api/http";
import { DomainError } from "@/domain/shared/errors";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const app = getRuntime();
  const auth = requireSession(request, app.auth);
  if (!auth)
    return errorResponse(401, "UNAUTHENTICATED", "Authentication required.");
  try {
    const result = app.character.get(auth.ownerId);
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
      errorResponse(500, "CHARACTER_FAILED", "Character could not be loaded."),
      auth,
      app.config.APP_ORIGIN,
    );
  }
}
