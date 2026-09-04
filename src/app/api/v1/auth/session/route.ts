import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LoginRateLimiter } from "@/application/auth/rate-limit";
import {
  errorResponse,
  parseJson,
  sameOrigin,
  requireSession,
  sessionToken,
} from "@/application/http";
import { loginSchema } from "@/contracts/http";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";
let limiter: LoginRateLimiter | undefined;
function getLimiter(): LoginRateLimiter {
  limiter ??= new LoginRateLimiter(getRuntime().clock);
  return limiter;
}
const cookie = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 12 * 60 * 60,
};

export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return errorResponse(403, "ORIGIN", "Request origin is not allowed.");
  const key = "owner-login";
  const limiter = getLimiter();
  if (!limiter.canAttempt(key))
    return errorResponse(429, "RATE_LIMITED", "Try again later.");
  try {
    const input = await parseJson(request, loginSchema);
    const result = await getRuntime().auth.createSession(input.password);
    if (!result) {
      limiter.recordFailure(key);
      return errorResponse(401, "AUTH_FAILED", "Invalid credentials.");
    }
    limiter.clear(key);
    const response = NextResponse.json({ csrfToken: result.csrfToken });
    response.cookies.set("lifemaxing_session", result.token, cookie);
    return response;
  } catch (error) {
    if (error instanceof ZodError)
      return errorResponse(401, "AUTH_FAILED", "Invalid credentials.");
    return errorResponse(500, "AUTH_FAILED", "Authentication failed.");
  }
}

export async function DELETE(request: NextRequest) {
  if (!requireSession(request, true))
    return errorResponse(
      401,
      "UNAUTHENTICATED",
      "Authentication and CSRF validation required.",
    );
  getRuntime().auth.revoke(sessionToken(request));
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set("lifemaxing_session", "", { ...cookie, maxAge: 0 });
  return response;
}
