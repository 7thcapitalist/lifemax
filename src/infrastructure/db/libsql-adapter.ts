import type Database from "better-sqlite3";
import type Libsql from "libsql";

/**
 * The `libsql` package advertises a better-sqlite3-compatible surface, and this
 * codebase consumes it through better-sqlite3's own types. Several methods
 * diverge from that contract silently, without a type error to show for it.
 *
 * The one that reached production: `Statement.get()` never consults the flag
 * that `pluck()` sets, so `.pluck().get()` returns the whole row object instead
 * of the first column's value. Every `as number` cast over such a call was a
 * lie, and one of those objects rode into React, which threw #31 ("objects are
 * not valid as a React child") and blanked the page.
 *
 * This adapter restates the contract at the boundary so call sites can keep
 * writing ordinary better-sqlite3 and be right. Repairing it here rather than at
 * the call sites is deliberate: `repositories-game.ts` alone had nine `.pluck()`
 * uses, and patching them one at a time leaves the tenth to break the same way.
 *
 * Divergences that cannot be repaired from JavaScript — `function()`,
 * `aggregate()`, `backup()`, `serialize()`, `table()` and `unsafeMode()` all
 * throw "not implemented" inside libsql itself — are left as they are and
 * documented in docs/libsql-contract.md.
 */

type PresentationMode = "default" | "pluck" | "raw" | "expand";

/** The subset of libsql's Statement this wrapper drives. */
interface InnerStatement {
  readonly reader: boolean;
  raw(toggle: boolean): unknown;
  safeIntegers(toggle: boolean): unknown;
  columns(): Database.ColumnDefinition[];
  run(...parameters: unknown[]): Database.RunResult;
  get(...parameters: unknown[]): unknown;
  all(...parameters: unknown[]): unknown[];
  iterate(...parameters: unknown[]): Iterable<unknown>;
}

/**
 * libsql attaches a `_metadata` timing object to rows returned by `get()` — and
 * only by `get()`; `all()` and `iterate()` rows are clean. better-sqlite3 rows
 * carry exactly the selected columns, so without this any code that spreads a
 * row (`{ ...row }`, as `mission()` and `characterSheet()` do) would ship a
 * foreign key into domain objects, API responses and `toEqual` comparisons.
 */
function stripMetadata(row: unknown): unknown {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return row;
  if (!("_metadata" in row)) return row;
  const columns: Record<string, unknown> = {
    ...(row as Record<string, unknown>),
  };
  delete columns._metadata;
  return columns;
}

class LibsqlStatement {
  private mode: PresentationMode = "default";
  private openCursors = 0;
  private rawApplied = false;

  constructor(
    private readonly inner: InnerStatement,
    private readonly sql: string,
  ) {}

  /** better-sqlite3 reports the SQL a statement was prepared from; libsql leaves it undefined. */
  get source(): string {
    return this.sql;
  }

  get reader(): boolean {
    return this.inner.reader;
  }

  /** True from the moment `iterate()` hands out a cursor until it is exhausted or closed. */
  get busy(): boolean {
    return this.openCursors > 0;
  }

  /**
   * better-sqlite3 treats pluck/raw/expand as one setting: the last call wins,
   * and passing `false` returns to plain row objects. libsql keeps `pluck` in
   * JavaScript and `raw` in native state, so both can be live at once and the
   * result depends on which layer looks first.
   */
  private setMode(mode: PresentationMode, toggle: boolean): this {
    if (!this.inner.reader)
      throw new TypeError(
        `The ${mode}() method is only for statements that return data`,
      );
    this.mode = toggle ? mode : "default";
    return this;
  }

  pluck(toggle = true): this {
    return this.setMode("pluck", toggle);
  }

  raw(toggle = true): this {
    return this.setMode("raw", toggle);
  }

  expand(toggle = true): this {
    return this.setMode("expand", toggle);
  }

  /**
   * pluck and expand are both positional reads: pluck takes column 0, and expand
   * has to keep same-named columns apart. Driving them off libsql's native raw
   * mode matches better-sqlite3 exactly — including `SELECT a AS x, b AS x`,
   * where the object form collapses to the *last* `x` while pluck must yield the
   * *first* column.
   *
   * The mode is applied before each call rather than saved and restored: this
   * wrapper is the statement's only owner, and `iterate()` converts rows lazily,
   * so restoring afterwards would corrupt a cursor that is still open.
   */
  private applyMode(): void {
    const positional = this.mode !== "default";
    if (positional === this.rawApplied) return;
    // Only toggle on an actual change: libsql's native raw() rejects statements
    // that return no data, and `pragma("foreign_keys = ON")` is one of those.
    // A non-reader can never leave "default" mode, so this stays a no-op there.
    this.inner.raw(positional);
    this.rawApplied = positional;
  }

  /** better-sqlite3 groups columns by source table, with `$` for expressions. */
  private present(row: unknown): unknown {
    if (row === undefined) return undefined;
    if (this.mode === "pluck") return (row as unknown[])[0];
    if (this.mode === "raw") return row;
    if (this.mode === "default") return stripMetadata(row);
    const cells = row as unknown[];
    const expanded: Record<string, Record<string, unknown>> = {};
    this.inner.columns().forEach((column, index) => {
      (expanded[column.table ?? "$"] ??= {})[column.name] = cells[index];
    });
    return expanded;
  }

  run(...parameters: unknown[]): Database.RunResult {
    return this.inner.run(...parameters);
  }

  get(...parameters: unknown[]): unknown {
    this.applyMode();
    return this.present(this.inner.get(...parameters));
  }

  all(...parameters: unknown[]): unknown[] {
    this.applyMode();
    const rows = this.inner.all(...parameters);
    return this.mode === "default"
      ? rows
      : rows.map((row) => this.present(row));
  }

  /**
   * Deliberately not a generator: better-sqlite3 marks a statement busy the
   * moment `iterate()` hands back a cursor, whereas a generator body would not
   * run — and the counter would not move — until the first `next()`.
   */
  iterate(...parameters: unknown[]): IterableIterator<unknown> {
    this.applyMode();
    const source = this.inner.iterate(...parameters)[Symbol.iterator]();
    this.openCursors += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.openCursors -= 1;
    };
    return {
      next: () => {
        if (released) return { value: undefined, done: true };
        const step = source.next();
        if (step.done) {
          release();
          return { value: undefined, done: true };
        }
        return { value: this.present(step.value), done: false };
      },
      return: (value?: unknown) => {
        release();
        source.return?.(value);
        return { value, done: true };
      },
      throw: (error?: unknown) => {
        release();
        throw error;
      },
      [Symbol.iterator]() {
        return this;
      },
    } as IterableIterator<unknown>;
  }

  columns(): Database.ColumnDefinition[] {
    return this.inner.columns();
  }

  safeIntegers(toggle = true): this {
    this.inner.safeIntegers(toggle);
    return this;
  }
}

/**
 * Wraps a libsql connection so it honours better-sqlite3's contract.
 *
 * `pragma(source, { simple: true })` is re-implemented on purpose rather than
 * delegated: libsql builds it out of `stmt.pluck().get()`, so it returned a row
 * object too — the same defect in a second place, reached by
 * `scripts/restore-check.ts` and the backup suite. Routing it through the
 * wrapped statement fixes both at once.
 */
export function adaptLibsql(
  connection: InstanceType<typeof Libsql>,
  url: string,
): Database.Database {
  const prepare = (sql: string) =>
    new LibsqlStatement(connection.prepare(sql) as InnerStatement, sql);
  const overrides: Record<string, unknown> = {
    prepare,
    name: url,
    pragma(source: string, options?: { simple?: boolean }) {
      const statement = prepare(`PRAGMA ${source}`);
      return options?.simple ? statement.pluck().get() : statement.all();
    },
  };
  return new Proxy(connection, {
    get(target, property, receiver) {
      if (property in overrides) return overrides[property as string];
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as Database.Database;
}
