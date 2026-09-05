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
    const date = request.nextUrl.searchParams.get("date") ?? undefined;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return applyRotatedSession(
        errorResponse(422, "VALIDATION", "Invalid local date."),
        auth,
        app.config.APP_ORIGIN,
      );
    const result = app.today.get(auth.ownerId, date);
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
      errorResponse(500, "TODAY_FAILED", "Today could not be loaded."),
      auth,
      app.config.APP_ORIGIN,
    );
  }
}
