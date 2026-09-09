import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  applyRotatedSession,
  errorResponse,
  handledApiError,
  parseJson,
  requireSession,
  sameOrigin,
} from "@/app/api/http";
import { updateChapterSchema } from "@/contracts/game";
import { runtime as getRuntime } from "@/infrastructure/runtime";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const app = getRuntime(),
    auth = requireSession(request, app.auth);
  if (!auth)
    return errorResponse(401, "UNAUTHENTICATED", "Authentication required.");
  try {
    const { id } = await context.params;
    return applyRotatedSession(
      NextResponse.json(app.game.getChapter(auth.ownerId, id)),
      auth,
      app.config.APP_ORIGIN,
    );
  } catch (e) {
    return handledApiError(e, auth, app.config.APP_ORIGIN);
  }
}
export async function PATCH(
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
  try {
    const { id } = await context.params;
    return applyRotatedSession(
      NextResponse.json(
        app.game.updateChapter(
          auth.ownerId,
          id,
          await parseJson(request, updateChapterSchema),
        ),
      ),
      auth,
      app.config.APP_ORIGIN,
    );
  } catch (e) {
    return handledApiError(e, auth, app.config.APP_ORIGIN);
  }
}
