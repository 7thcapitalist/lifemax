export const DEFAULT_ARC_LENGTH_DAYS = 66;

const dateValue = (date: string): number =>
  new Date(`${date}T00:00:00Z`).getTime();

export function daysInclusive(startDate: string, endDate: string): number {
  return (
    Math.floor((dateValue(endDate) - dateValue(startDate)) / 86_400_000) + 1
  );
}

export function dateAfter(startDate: string, offsetDays: number): string {
  return new Date(dateValue(startDate) + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function arcDayCounter(
  startDate: string,
  lengthDays: number,
  today: string,
): { day: number; of: number } {
  const elapsed = Math.floor(
    (dateValue(today) - dateValue(startDate)) / 86_400_000,
  );
  return {
    day: Math.min(lengthDays, Math.max(1, elapsed + 1)),
    of: lengthDays,
  };
}
