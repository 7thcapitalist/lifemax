import BetterSqlite3 from "better-sqlite3";
import Libsql from "libsql";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/infrastructure/db/client";
import { SqliteGameRepositories } from "@/infrastructure/db/repositories-game";
import { SqliteRepositories } from "@/infrastructure/db/repositories";
import { migratedLibsqlDatabase } from "../helpers";

/**
 * Why this file exists.
 *
 * Production runs libsql. `.pluck().get()` returned the whole row object there
 * instead of the first column's value, an `as number` cast hid it from
 * TypeScript, and the object reached React, which threw #31 and served a white
 * screen. The suite was green throughout, because every `.pluck()` assertion in
 * it ran against better-sqlite3.
 *
 * The divergence lives in libsql's JavaScript `Statement` class — `get()` simply
 * never read the flag `pluck()` sets — and that class is the same object
 * whether rows come from memory, a file, or a remote `libsql://` server. So
 * these tests exercise the real defect without a network endpoint, and the
 * first test below is what keeps that claim honest: it fails if the connection
 * under test is ever quietly a better-sqlite3 one.
 *
 * What this file does NOT cover: anything that differs by *backend* rather than
 * by driver wrapper — SQL dialect differences, server-side trigger behaviour,
 * replication, or network error mapping. Those need a real remote endpoint.
 */

function openLibsql() {
  return openDatabase({
    DB_DRIVER: "libsql",
    DATABASE_PATH: ":memory:",
    DATABASE_URL: ":memory:",
    DATABASE_AUTH_TOKEN: "synthetic",
  });
}

function openBetterSqlite3() {
  return openDatabase(":memory:");
}

const fixture = `
  CREATE TABLE coin_ledger (owner_id TEXT NOT NULL, delta INTEGER NOT NULL);
  INSERT INTO coin_ledger VALUES ('o1', 5), ('o1', 7);
  CREATE TABLE t (a TEXT, b TEXT);
  INSERT INTO t VALUES ('a1', 'b1'), ('a2', 'b2');
  CREATE TABLE empty (a TEXT);
`;

type Statements = BetterSqlite3.Database;

/**
 * One table of operations, asserted identical on both drivers. A new divergence
 * in this surface fails on the libsql row and passes on the better-sqlite3 row,
 * which names the culprit without any further digging.
 */
const contract: Array<{ name: string; run: (db: Statements) => unknown }> = [
  {
    // The production query, verbatim: repositories-game.ts characterSheet().
    name: "pluck().get() on an aggregate yields the scalar",
    run: (db) =>
      db
        .prepare(
          "SELECT coalesce(sum(delta),0) FROM coin_ledger WHERE owner_id=?",
        )
        .pluck()
        .get("o1"),
  },
  {
    name: "pluck().get() on a named column yields the scalar",
    run: (db) => db.prepare("SELECT a FROM t LIMIT 1").pluck().get(),
  },
  {
    name: "pluck().get() on no rows yields undefined",
    run: (db) => db.prepare("SELECT a FROM empty").pluck().get(),
  },
  {
    name: "pluck().get() on a NULL column yields null",
    run: (db) => db.prepare("SELECT NULL FROM t LIMIT 1").pluck().get(),
  },
  {
    // Object rows collapse duplicate names to the last column; pluck must still
    // take the first. Only a positional read gets this right.
    name: "pluck().get() takes the first column when names collide",
    run: (db) =>
      db.prepare("SELECT a AS x, b AS x FROM t LIMIT 1").pluck().get(),
  },
  {
    name: "pluck().all() yields first-column values",
    run: (db) => db.prepare("SELECT a FROM t ORDER BY a").pluck().all(),
  },
  {
    name: "pluck().all() on no rows yields an empty array",
    run: (db) => db.prepare("SELECT a FROM empty").pluck().all(),
  },
  {
    name: "pluck().iterate() yields first-column values",
    run: (db) => [
      ...db.prepare("SELECT a FROM t ORDER BY a").pluck().iterate(),
    ],
  },
  {
    name: "a plucked statement stays plucked across calls",
    run: (db) => {
      const statement = db.prepare("SELECT a FROM t ORDER BY a").pluck();
      return [statement.get(), statement.get(), statement.all()];
    },
  },
  {
    name: "pluck(false) restores row objects",
    run: (db) =>
      db.prepare("SELECT a FROM t LIMIT 1").pluck().pluck(false).get(),
  },
  {
    // pluck/raw/expand are one setting in better-sqlite3: last call wins. libsql
    // kept pluck in JavaScript and raw in native state, so both could be live.
    name: "raw() after pluck() wins",
    run: (db) => db.prepare("SELECT a, b FROM t LIMIT 1").pluck().raw().get(),
  },
  {
    name: "pluck() after raw() wins",
    run: (db) => db.prepare("SELECT a, b FROM t LIMIT 1").raw().pluck().get(),
  },
  {
    name: "get() returns exactly the selected columns",
    run: (db) => db.prepare("SELECT a, b FROM t LIMIT 1").get(),
  },
  {
    name: "get() rows survive a spread unchanged",
    run: (db) => ({
      ...(db.prepare("SELECT a, b FROM t LIMIT 1").get() as object),
      extra: true,
    }),
  },
  {
    name: "raw().get() yields a positional array",
    run: (db) => db.prepare("SELECT a, b FROM t LIMIT 1").raw().get(),
  },
  {
    name: "expand().get() groups columns by source table",
    run: (db) => db.prepare("SELECT a, b FROM t LIMIT 1").expand().get(),
  },
  {
    name: "expand().get() files expressions under $",
    run: (db) =>
      db.prepare("SELECT a, 1 + 1 AS n FROM t LIMIT 1").expand().get(),
  },
  {
    name: "pluck() on a statement that returns no data throws",
    run: (db) => {
      try {
        db.prepare("INSERT INTO empty VALUES ('z')").pluck();
        return "did not throw";
      } catch (error) {
        return (error as Error).message;
      }
    },
  },
  {
    // libsql implements pragma(simple) as stmt.pluck().get(), so it carried the
    // same defect — reached by scripts/restore-check.ts and the backup suite.
    name: "pragma(simple) yields a scalar",
    run: (db) => db.pragma("integrity_check", { simple: true }),
  },
  {
    name: "source reports the prepared SQL",
    run: (db) => db.prepare("SELECT a FROM t").source,
  },
  {
    name: "busy tracks an open cursor",
    run: (db) => {
      const statement = db.prepare("SELECT a FROM t ORDER BY a");
      const cursor = statement.iterate();
      const before = statement.busy;
      cursor.next();
      const during = statement.busy;
      cursor.return?.();
      return [before, during, statement.busy];
    },
  },
];

describe("libsql honours the better-sqlite3 statement contract", () => {
  it("runs these tests against libsql and not better-sqlite3", () => {
    // The guard that makes the rest of this file mean what it says. The previous
    // "production libsql adapter" test used DATABASE_URL=':memory:' and was
    // trusted to be exercising production; it was, but it never called pluck.
    // This one proves the driver identity outright.
    const libsql = openLibsql();
    const better = openBetterSqlite3();
    try {
      expect(libsql.sqlite).toBeInstanceOf(Libsql);
      expect(libsql.sqlite).not.toBeInstanceOf(BetterSqlite3);
      expect(better.sqlite).toBeInstanceOf(BetterSqlite3);
      expect(better.sqlite).not.toBeInstanceOf(Libsql);
    } finally {
      libsql.sqlite.close();
      better.sqlite.close();
    }
  });

  for (const { name, run } of contract) {
    it(name, () => {
      const libsql = openLibsql();
      const better = openBetterSqlite3();
      try {
        libsql.sqlite.exec(fixture);
        better.sqlite.exec(fixture);
        expect(run(libsql.sqlite)).toStrictEqual(run(better.sqlite));
      } finally {
        libsql.sqlite.close();
        better.sqlite.close();
      }
    });
  }

  it("never leaks libsql's _metadata into a row", () => {
    const connection = openLibsql();
    try {
      connection.sqlite.exec(fixture);
      const row = connection.sqlite.prepare("SELECT a, b FROM t LIMIT 1").get();
      expect(Object.keys(row as object)).toStrictEqual(["a", "b"]);
      expect(JSON.stringify(row)).not.toContain("_metadata");
    } finally {
      connection.sqlite.close();
    }
  });
});

describe("the query that blanked production", () => {
  it("returns a renderable coin balance through the libsql driver", () => {
    const connection = migratedLibsqlDatabase();
    try {
      const ownerId = "00000000-0000-4000-8000-000000000001";
      const now = "2026-09-09T12:00:00.000Z";
      const base = new SqliteRepositories(connection);
      base.owners.createWithCredential({
        id: ownerId,
        displayName: "Owner",
        timezone: "UTC",
        passwordHash: "test",
        now,
      });
      base.owners.completeOnboarding(
        ownerId,
        {
          becomingStatement: "Become grounded",
          aspects: ["Custom A", "Custom B", "Custom C", "Custom D"].map(
            (name) => ({
              name,
              definition: "User defined",
              desiredIdentity: "Intent",
              emphasis: "active" as const,
            }),
          ),
          northStars: [],
          chapter: {
            title: "Chapter",
            intent: "Intent",
            startDate: "2026-09-01",
            endDate: "2026-10-01",
            milestones: [
              { title: "Milestone", doneCondition: "Done", aspectIndexes: [0] },
            ],
          },
          guardrails: [{ category: "recovery", statement: "Protect rest" }],
        },
        now,
      );

      const sheet = new SqliteGameRepositories(connection).characterSheet(
        ownerId,
      );

      // React error #31 is thrown by whatever is rendered, so the assertion that
      // actually guards the page is the type, not the value.
      expect(typeof sheet.wallet.coinBalance).toBe("number");
      expect(sheet.wallet.coinBalance).toBe(0);
    } finally {
      connection.sqlite.close();
    }
  });
});
