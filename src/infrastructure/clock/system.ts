import type { CalendarService, Clock } from "@/application/ports/time";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class IntlCalendarService implements CalendarService {
  localDate(instant: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
}
