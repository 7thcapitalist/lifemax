import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  applyRotatedSession,
  errorResponse,
  requireSession,
} from "@/app/api/http";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const app = getRuntime();
  const auth = requireSession(request, app.auth);
  if (!auth)
    return errorResponse(401, "UNAUTHENTICATED", "Authentication required.");
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 20;
  if (limitParam && (!Number.isInteger(limit) || limit < 1))
    return applyRotatedSession(
      errorResponse(422, "VALIDATION", "Invalid limit."),
      auth,
      app.config.APP_ORIGIN,
    );
  const result = app.chronicle.list(auth.ownerId, cursor, limit);
  return applyRotatedSession(
    NextResponse.json(result),
    auth,
    app.config.APP_ORIGIN,
  );
}
