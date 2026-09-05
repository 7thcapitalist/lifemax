import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  applyRotatedSession,
  errorResponse,
  requireSession,
  sessionToken,
} from "@/app/api/http";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const app = getRuntime();
  const auth = requireSession(request, app.auth);
  if (!auth) return NextResponse.json(app.bootstrap.publicStatus());
  const result = app.bootstrap.get(auth.ownerId);
  if (!result)
    return errorResponse(401, "UNAUTHENTICATED", "Authentication required.");
  const csrfToken = app.auth.refreshCsrf(
    auth.rotatedToken ?? sessionToken(request),
  );
  if (!csrfToken)
    return errorResponse(401, "UNAUTHENTICATED", "Authentication required.");
  return applyRotatedSession(
    NextResponse.json({ ...result, csrfToken }),
    auth,
    app.config.APP_ORIGIN,
  );
}
