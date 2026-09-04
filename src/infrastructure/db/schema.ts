import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
};

export const owners = sqliteTable(
  "owner",
  {
    id: text("id").primaryKey(),
    singletonKey: integer("singleton_key").notNull().default(1),
    displayName: text("display_name").notNull(),
    timezone: text("timezone").notNull(),
    becomingStatement: text("becoming_statement").notNull().default(""),
    setupCompleted: integer("setup_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [
    unique("owner_singleton").on(table.singletonKey),
    check("owner_singleton_check", sql`${table.singletonKey} = 1`),
  ],
);

export const credentials = sqliteTable("credential", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => owners.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  changedAt: text("changed_at").notNull(),
});

export const sessions = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    csrfHash: text("csrf_hash").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at").notNull(),
    idleExpiresAt: text("idle_expires_at").notNull(),
    absoluteExpiresAt: text("absolute_expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [index("session_owner_idx").on(table.ownerId)],
);

export const characterAspects = sqliteTable(
  "character_aspect",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    definition: text("definition").notNull(),
    desiredIdentity: text("desired_identity").notNull(),
    emphasis: text("emphasis", {
      enum: ["active", "maintenance", "dormant"],
    }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    archivedAt: text("archived_at"),
    level: integer("level").notNull().default(1),
    currentXp: integer("current_xp").notNull().default(0),
    ...timestamps,
  },
  (table) => [unique("aspect_owner_id").on(table.ownerId, table.id)],
);

export const northStars = sqliteTable(
  "north_star",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    motivation: text("motivation").notNull(),
    status: text("status", { enum: ["active", "archived"] }).notNull(),
    ...timestamps,
  },
  (table) => [unique("north_star_owner_id").on(table.ownerId, table.id)],
);

export const chapters = sqliteTable(
  "chapter",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    intent: text("intent").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: text("status", {
      enum: ["draft", "active", "completed", "abandoned"],
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("chapter_owner_id").on(table.ownerId, table.id),
    uniqueIndex("one_active_chapter")
      .on(table.ownerId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const milestones = sqliteTable("milestone", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => owners.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id")
    .notNull()
    .references(() => chapters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  doneCondition: text("done_condition").notNull(),
  status: text("status", {
    enum: ["planned", "active", "completed", "replaced", "abandoned"],
  }).notNull(),
  targetDate: text("target_date"),
  sortOrder: integer("sort_order").notNull(),
  ...timestamps,
});

export const balanceGuardrails = sqliteTable("balance_guardrail", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => owners.id, { onDelete: "cascade" }),
  category: text("category", {
    enum: ["sleep", "connection", "recovery", "novelty", "custom"],
  }).notNull(),
  statement: text("statement").notNull(),
  status: text("status", { enum: ["active", "paused", "archived"] }).notNull(),
  ...timestamps,
});

export const dailyCheckIns = sqliteTable(
  "daily_check_in",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    capacity: text("capacity", { enum: ["low", "normal", "high"] }).notNull(),
    reflection: text("reflection"),
    ...timestamps,
  },
  (table) => [unique("check_in_owner_date").on(table.ownerId, table.localDate)],
);

export const quests = sqliteTable(
  "quest",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    title: text("title").notNull(),
    doneCondition: text("done_condition").notNull(),
    reason: text("reason").notNull(),
    size: text("size", { enum: ["small", "standard", "major"] }).notNull(),
    source: text("source", { enum: ["owner", "deterministic"] }).notNull(),
    status: text("status", {
      enum: [
        "proposed",
        "accepted",
        "declined",
        "completed",
        "attempted",
        "dropped",
      ],
    }).notNull(),
    role: text("role", { enum: ["main", "side"] }),
    milestoneId: text("milestone_id").references(() => milestones.id),
    lifeLived: integer("life_lived", { mode: "boolean" })
      .notNull()
      .default(false),
    repeatFamilyKey: text("repeat_family_key"),
    acceptedSize: text("accepted_size", {
      enum: ["small", "standard", "major"],
    }),
    acceptedAt: text("accepted_at"),
    ...timestamps,
  },
  (table) => [
    unique("quest_owner_id").on(table.ownerId, table.id),
    index("quest_owner_date_idx").on(table.ownerId, table.localDate),
  ],
);

export const questOutcomes = sqliteTable("quest_outcome", {
  id: text("id").primaryKey(),
  questId: text("quest_id")
    .notNull()
    .unique()
    .references(() => quests.id, { onDelete: "cascade" }),
  ownerId: text("owner_id")
    .notNull()
    .references(() => owners.id, { onDelete: "cascade" }),
  outcome: text("outcome", {
    enum: ["completed", "attempted", "dropped"],
  }).notNull(),
  occurredAt: text("occurred_at").notNull(),
  reflection: text("reflection"),
  acceptedSize: text("accepted_size", {
    enum: ["small", "standard", "major"],
  }).notNull(),
});

export const briefings = sqliteTable(
  "briefing",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    generatorVersion: text("generator_version").notNull(),
    generatorKind: text("generator_kind", {
      enum: ["deterministic"],
    }).notNull(),
    mirror: text("mirror").notNull(),
    tradeoff: text("tradeoff"),
    citationsJson: text("citations_json").notNull().default("[]"),
    generatedAt: text("generated_at").notNull(),
    status: text("status", {
      enum: ["draft", "presented", "accepted", "superseded", "failed"],
    }).notNull(),
  },
  (table) => [
    unique("briefing_idempotency").on(
      table.ownerId,
      table.localDate,
      table.inputFingerprint,
      table.generatorVersion,
    ),
  ],
);

export const briefingSuggestions = sqliteTable(
  "briefing_suggestion",
  {
    id: text("id").primaryKey(),
    briefingId: text("briefing_id")
      .notNull()
      .references(() => briefings.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    questId: text("quest_id").references(() => quests.id),
    role: text("role", { enum: ["main", "side"] }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    unique("briefing_suggestion_order").on(
      table.briefingId,
      table.role,
      table.sortOrder,
    ),
  ],
);

export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => owners.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  factualText: text("factual_text").notNull(),
  localDate: text("local_date").notNull(),
  occurredAt: text("occurred_at"),
  provenanceType: text("provenance_type").notNull(),
  provenanceId: text("provenance_id").notNull(),
  confirmedAt: text("confirmed_at"),
  sourceSnapshot: text("source_snapshot").notNull(),
  createdAt: text("created_at").notNull(),
});

export const observations = sqliteTable(
  "observation",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    valueType: text("value_type", {
      enum: ["number", "string", "boolean"],
    }).notNull(),
    numberValue: real("number_value"),
    stringValue: text("string_value"),
    booleanValue: integer("boolean_value", { mode: "boolean" }),
    unit: text("unit"),
    observedStart: text("observed_start").notNull(),
    observedEnd: text("observed_end"),
    ingestedAt: text("ingested_at").notNull(),
    provider: text("provider").notNull(),
    connectionId: text("connection_id").notNull(),
    sourceRecordId: text("source_record_id").notNull(),
    sourceRevision: text("source_revision").notNull(),
    sourceType: text("source_type").notNull(),
    confidence: real("confidence"),
    qualityStatus: text("quality_status", {
      enum: ["raw", "normalized", "estimated", "corrected"],
    }).notNull(),
    importBatchId: text("import_batch_id").notNull(),
    adapterVersion: text("adapter_version").notNull(),
    lifecycleState: text("lifecycle_state", {
      enum: ["active", "corrected", "deleted"],
    }).notNull(),
    supersedesId: text("supersedes_id"),
  },
  (table) => [
    unique("observation_source_revision").on(
      table.ownerId,
      table.provider,
      table.connectionId,
      table.sourceRecordId,
      table.sourceRevision,
    ),
    check(
      "observation_typed_value",
      sql`(${table.valueType} = 'number' AND ${table.numberValue} IS NOT NULL AND ${table.stringValue} IS NULL AND ${table.booleanValue} IS NULL) OR (${table.valueType} = 'string' AND ${table.numberValue} IS NULL AND ${table.stringValue} IS NOT NULL AND ${table.booleanValue} IS NULL) OR (${table.valueType} = 'boolean' AND ${table.numberValue} IS NULL AND ${table.stringValue} IS NULL AND ${table.booleanValue} IS NOT NULL)`,
    ),
  ],
);

export const northStarAspects = sqliteTable(
  "north_star_aspect",
  {
    ownerId: text("owner_id").notNull(),
    northStarId: text("north_star_id").notNull(),
    aspectId: text("aspect_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.northStarId, table.aspectId] })],
);
export const chapterAspects = sqliteTable(
  "chapter_aspect",
  {
    ownerId: text("owner_id").notNull(),
    chapterId: text("chapter_id").notNull(),
    aspectId: text("aspect_id").notNull(),
    emphasisNote: text("emphasis_note"),
  },
  (table) => [primaryKey({ columns: [table.chapterId, table.aspectId] })],
);
export const milestoneAspects = sqliteTable(
  "milestone_aspect",
  {
    ownerId: text("owner_id").notNull(),
    milestoneId: text("milestone_id").notNull(),
    aspectId: text("aspect_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.milestoneId, table.aspectId] })],
);
export const questAspects = sqliteTable(
  "quest_aspect",
  {
    ownerId: text("owner_id").notNull(),
    questId: text("quest_id").notNull(),
    aspectId: text("aspect_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.questId, table.aspectId] })],
);
