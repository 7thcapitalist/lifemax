import { describe, expect, it } from "vitest";
import { IntlCalendarService } from "@/infrastructure/clock/system";

describe("owner-local calendar", () => {
  const calendar = new IntlCalendarService();
  it("uses owner timezone rather than server date", () => {
    const instant = new Date("2026-03-08T04:30:00.000Z");
    expect(calendar.localDate(instant, "America/Indiana/Indianapolis")).toBe(
      "2026-03-07",
    );
    expect(calendar.localDate(instant, "Asia/Tokyo")).toBe("2026-03-08");
  });
  it("is deterministic across DST transitions", () => {
    expect(
      calendar.localDate(new Date("2026-11-01T05:30:00Z"), "America/New_York"),
    ).toBe("2026-11-01");
    expect(
      calendar.localDate(new Date("2026-11-01T06:30:00Z"), "America/New_York"),
    ).toBe("2026-11-01");
  });
});
