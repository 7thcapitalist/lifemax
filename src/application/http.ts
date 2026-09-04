import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { runtime } from "@/infrastructure/runtime";

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

export async function parseJson<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 65_536) throw new Error("BODY_TOO_LARGE");
  return schema.parse(await request.json());
}

export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin === runtime().config.APP_ORIGIN;
}

export function sessionToken(request: NextRequest): string | undefined {
  return request.cookies.get("lifemaxing_session")?.value;
}

export function requireSession(request: NextRequest, requireCsrf = false) {
  if (requireCsrf && !sameOrigin(request)) return null;
  const csrf = requireCsrf
    ? (request.headers.get("x-csrf-token") ?? undefined)
    : undefined;
  return runtime().auth.authenticate(sessionToken(request), csrf);
}
