export interface Clock {
  now(): Date;
}

export interface CalendarService {
  localDate(instant: Date, timeZone: string): string;
}
