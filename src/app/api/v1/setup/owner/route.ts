import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { errorResponse, parseJson, sameOrigin } from "@/application/http";
import { setupOwnerSchema } from "@/contracts/http";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (
    !["127.0.0.1", "localhost"].includes(request.nextUrl.hostname) ||
    !sameOrigin(request)
  ) {
    return errorResponse(
      403,
      "SETUP_LOCAL_ONLY",
      "Owner setup is available only from the configured localhost origin.",
    );
  }
  try {
    const input = await parseJson(request, setupOwnerSchema);
    const result = await getRuntime().auth.setupOwner(input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
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
