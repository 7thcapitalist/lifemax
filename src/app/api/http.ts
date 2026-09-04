import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import type {
  AuthenticatedSession,
  AuthService,
} from "@/application/auth/service";

export const MAX_BODY_BYTES = 65_536;

export class RequestBodyError extends Error {
  constructor(
    readonly status: 400 | 413,
    readonly code: "INVALID_BODY" | "BODY_TOO_LARGE",
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  fieldErrors?: unknown,
) {
  return NextResponse.json(
    { code, message, fieldErrors, requestId: crypto.randomUUID() },
    { status },
  );
}

export function bodyErrorResponse(error: RequestBodyError) {
  return errorResponse(error.status, error.code, error.message);
}

export async function parseJson<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared))
      throw new RequestBodyError(
        400,
        "INVALID_BODY",
        "Invalid Content-Length.",
      );
    if (Number(declared) > MAX_BODY_BYTES)
      throw new RequestBodyError(
        413,
        "BODY_TOO_LARGE",
        "Request body is too large.",
      );
  }
  if (!request.body)
    throw new RequestBodyError(400, "INVALID_BODY", "A JSON body is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestBodyError(
          413,
          "BODY_TOO_LARGE",
          "Request body is too large.",
        );
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return schema.parse(JSON.parse(body));
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    if (error instanceof SyntaxError || error instanceof TypeError)
      throw new RequestBodyError(400, "INVALID_BODY", "Malformed JSON body.");
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function sameOrigin(request: NextRequest, appOrigin: string): boolean {
  return request.headers.get("origin") === appOrigin;
}

export function loginRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const candidate = realIp || forwarded;
  const source = candidate && isIP(candidate) ? candidate : "direct-client";
  return createHash("sha256").update(source).digest("hex");
}

export function sessionToken(request: NextRequest): string | undefined {
  return request.cookies.get("lifemaxing_session")?.value;
}

export function sessionCookieOptions(appOrigin: string) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: appOrigin.startsWith("https://"),
    path: "/",
    maxAge: 12 * 60 * 60,
  };
}

export function applyRotatedSession(
  response: NextResponse,
  auth: AuthenticatedSession,
  appOrigin: string,
): NextResponse {
  if (auth.rotatedToken)
    response.cookies.set(
      "lifemaxing_session",
      auth.rotatedToken,
      sessionCookieOptions(appOrigin),
    );
  return response;
}

export function requireSession(
  request: NextRequest,
  authService: AuthService,
  requireCsrf = false,
  rotate = true,
) {
  const csrf = requireCsrf
    ? (request.headers.get("x-csrf-token") ?? undefined)
    : undefined;
  return authService.authenticate(sessionToken(request), csrf, rotate);
}
