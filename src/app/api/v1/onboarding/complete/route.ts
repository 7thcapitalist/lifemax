import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { errorResponse, parseJson, requireSession } from "@/application/http";
import { onboardingSchema } from "@/contracts/http";
import { DomainError } from "@/domain/shared/errors";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const auth = requireSession(request, true);
  if (!auth)
    return errorResponse(
      401,
      "UNAUTHENTICATED",
      "Authentication and CSRF validation required.",
    );
  try {
    const input = await parseJson(request, onboardingSchema);
    getRuntime().onboarding.complete(auth.ownerId, input);
    return NextResponse.json({ completed: true });
  } catch (error) {
    if (error instanceof ZodError)
      return errorResponse(
        422,
        "VALIDATION",
        "Invalid onboarding request.",
        error.flatten().fieldErrors,
      );
    if (error instanceof DomainError)
      return errorResponse(409, error.code, error.message);
    return errorResponse(
      500,
      "ONBOARDING_FAILED",
      "Onboarding could not be completed.",
    );
  }
}
