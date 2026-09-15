export type Streak = {
  current: number;
  longest: number;
  asOfDate: string;
};

export type StreakDay = {
  localDate: string;
  completedMission: boolean;
  deliberateRest: boolean;
};

const shiftDate = (date: string, days: number): string => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function dayQualifies(
  day: Pick<StreakDay, "completedMission" | "deliberateRest">,
): boolean {
  return day.completedMission || day.deliberateRest;
}

export function computeStreak(
  days: readonly StreakDay[],
  asOfDate: string,
): Streak {
  const qualified = new Set<string>();
  for (const day of days) {
    if (day.localDate <= asOfDate && dayQualifies(day)) {
      qualified.add(day.localDate);
    }
  }

  const ordered = [...qualified].sort();
  let longest = 0;
  let run = 0;
  let previous: string | undefined;
  for (const date of ordered) {
    run = previous && shiftDate(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  // Today is allowed to remain in progress. A missing today does not erase a
  // streak that was intact yesterday; any earlier unaccounted day does.
  let cursor = qualified.has(asOfDate) ? asOfDate : shiftDate(asOfDate, -1);
  let current = 0;
  while (qualified.has(cursor)) {
    current += 1;
    cursor = shiftDate(cursor, -1);
  }

  return { current, longest, asOfDate };
}
