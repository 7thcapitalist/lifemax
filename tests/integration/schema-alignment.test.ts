import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  balanceGuardrails,
  briefingSuggestions,
  briefings,
  chapterAspects,
  chapters,
  characterAspects,
  credentials,
  dailyCheckIns,
  evidence,
  evidenceLinks,
  milestoneAspects,
  milestones,
  northStarAspects,
  northStars,
  observations,
  owners,
  questAspects,
  questOutcomes,
  quests,
  sessions,
  sessionTokenHistory,
  xpLedger,
} from "@/infrastructure/db/schema";
import { migratedDatabase } from "../helpers";

const tables = [
  owners,
  credentials,
  sessions,
  sessionTokenHistory,
  characterAspects,
  northStars,
  chapters,
  milestones,
  balanceGuardrails,
  northStarAspects,
  chapterAspects,
  milestoneAspects,
  dailyCheckIns,
  quests,
  questAspects,
  questOutcomes,
  briefings,
  briefingSuggestions,
  evidence,
  evidenceLinks,
  xpLedger,
  observations,
];

describe("executable SQL and Drizzle metadata", () => {
  it("declare the same foundation tables and columns", () => {
    const { sqlite } = migratedDatabase();
    const sqlTableNames = (
      sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__lifemaxing_%' ORDER BY name",
        )
        .pluck()
        .all() as string[]
    ).sort();
    const drizzleTableNames = tables.map(getTableName).sort();
    expect(drizzleTableNames).toEqual(sqlTableNames);

    for (const table of tables) {
      const sqlColumns = (
        sqlite
          .prepare(`PRAGMA table_info("${getTableName(table)}")`)
          .all() as Array<{
          name: string;
        }>
      )
        .map((column) => column.name)
        .sort();
      const drizzleColumns = Object.values(getTableColumns(table))
        .map((column) => column.name)
        .sort();
      expect(drizzleColumns, getTableName(table)).toEqual(sqlColumns);
    }
    sqlite.close();
  });
});
