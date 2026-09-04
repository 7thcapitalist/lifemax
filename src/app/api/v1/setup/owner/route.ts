import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  bodyErrorResponse,
  errorResponse,
  parseJson,
  RequestBodyError,
  sameOrigin,
} from "@/app/api/http";
import { setupOwnerSchema } from "@/contracts/http";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const app = getRuntime();
  const forwarded = [
    "forwarded",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "via",
  ].some((header) => request.headers.has(header));
  if (
    app.config.SETUP_MODE !== "local" ||
    forwarded ||
    !["127.0.0.1", "localhost", "[::1]"].includes(request.nextUrl.hostname) ||
    !sameOrigin(request, app.config.APP_ORIGIN)
  ) {
    return errorResponse(
      403,
      "SETUP_LOCAL_ONLY",
      "Owner setup requires an explicitly enabled local provisioning window.",
    );
  }
  try {
    const input = await parseJson(request, setupOwnerSchema);
    const result = await app.auth.setupOwner(input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return bodyErrorResponse(error);
    if (error instanceof ZodError)
      return errorResponse(
        422,
        "VALIDATION",
        "Invalid setup request.",
        error.flatten().fieldErrors,
      );
    if (error instanceof Error && error.message === "SETUP_CLOSED")
      return errorResponse(409, "SETUP_CLOSED", "Owner setup is closed.");
    return errorResponse(500, "SETUP_FAILED", "Owner setup failed.");
  }
}
