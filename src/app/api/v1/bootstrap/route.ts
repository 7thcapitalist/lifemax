import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { errorResponse, requireSession } from "@/application/http";
import { IntlCalendarService } from "@/infrastructure/clock/system";
import { owners } from "@/infrastructure/db/schema";
import { runtime as getRuntime } from "@/infrastructure/runtime";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (!auth)
    return errorResponse(401, "UNAUTHENTICATED", "Authentication required.");
  const owner = getRuntime()
    .connection.db.select({
      id: owners.id,
      displayName: owners.displayName,
      timezone: owners.timezone,
      becomingStatement: owners.becomingStatement,
      setupCompleted: owners.setupCompleted,
      version: owners.version,
    })
    .from(owners)
    .where(eq(owners.id, auth.ownerId))
    .get();
  if (!owner)
    return errorResponse(401, "UNAUTHENTICATED", "Authentication required.");
  const localDate = new IntlCalendarService().localDate(
    getRuntime().clock.now(),
    owner.timezone,
  );
  return NextResponse.json({
    owner,
    localDate,
    aiMode: "disabled",
    navigation: ["today", "character", "chronicle"],
  });
}
