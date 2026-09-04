import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  bodyErrorResponse,
  errorResponse,
  loginRateLimitKey,
  parseJson,
  RequestBodyError,
  requireSession,
  sameOrigin,
  sessionCookieOptions,
  sessionToken,
} from "@/app/api/http";
import { loginSchema } from "@/contracts/http";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const app = getRuntime();
  if (!sameOrigin(request, app.config.APP_ORIGIN))
    return errorResponse(403, "ORIGIN", "Request origin is not allowed.");
  const key = loginRateLimitKey(request);
  if (!app.loginLimiter.canAttempt(key))
    return errorResponse(429, "RATE_LIMITED", "Try again later.");
  try {
    const input = await parseJson(request, loginSchema);
    const result = await app.auth.createSession(input.password);
    if (!result) {
      app.loginLimiter.recordFailure(key);
      return errorResponse(401, "AUTH_FAILED", "Invalid credentials.");
    }
    app.loginLimiter.clear(key);
    const response = NextResponse.json({ csrfToken: result.csrfToken });
    response.cookies.set(
      "lifemaxing_session",
      result.token,
      sessionCookieOptions(app.config.APP_ORIGIN),
    );
    return response;
  } catch (error) {
    if (error instanceof RequestBodyError) {
      app.loginLimiter.recordFailure(key);
      return bodyErrorResponse(error);
    }
    if (error instanceof ZodError) {
      app.loginLimiter.recordFailure(key);
      return errorResponse(401, "AUTH_FAILED", "Invalid credentials.");
    }
    return errorResponse(500, "AUTH_FAILED", "Authentication failed.");
  }
}

export async function DELETE(request: NextRequest) {
  const app = getRuntime();
  if (!sameOrigin(request, app.config.APP_ORIGIN))
    return errorResponse(403, "ORIGIN", "Request origin is not allowed.");
  if (!requireSession(request, app.auth, true, false))
    return errorResponse(
      401,
      "UNAUTHENTICATED",
      "Authentication and CSRF validation required.",
    );
  app.auth.revoke(sessionToken(request));
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set("lifemaxing_session", "", {
    ...sessionCookieOptions(app.config.APP_ORIGIN),
    maxAge: 0,
  });
  return response;
}
