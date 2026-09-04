import path from "node:path";
import { openDatabase } from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrate";
import type { Clock } from "@/application/ports/time";

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  set(value: Date): void {
    this.current = value;
  }
}

export function migratedDatabase() {
  const connection = openDatabase(":memory:");
  runMigrations(connection, path.resolve("migrations"));
  return connection;
}
