PRAGMA foreign_keys = ON;

CREATE TABLE owner (
  id TEXT PRIMARY KEY NOT NULL,
  singleton_key INTEGER NOT NULL DEFAULT 1 CHECK (singleton_key = 1),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
  timezone TEXT NOT NULL,
  becoming_statement TEXT NOT NULL DEFAULT '' CHECK (length(becoming_statement) <= 2000),
  setup_completed INTEGER NOT NULL DEFAULT 0 CHECK (setup_completed IN (0, 1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(singleton_key), UNIQUE(id, singleton_key)
);
CREATE TABLE credential (
  owner_id TEXT PRIMARY KEY NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL, changed_at TEXT NOT NULL
);
CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL, last_used_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL, absolute_expires_at TEXT NOT NULL, revoked_at TEXT
);
CREATE INDEX session_owner_idx ON session(owner_id);

CREATE TABLE character_aspect (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  definition TEXT NOT NULL CHECK (length(definition) BETWEEN 1 AND 1000),
  desired_identity TEXT NOT NULL CHECK (length(desired_identity) BETWEEN 1 AND 1000),
  emphasis TEXT NOT NULL CHECK (emphasis IN ('active','maintenance','dormant')),
  sort_order INTEGER NOT NULL, archived_at TEXT, level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  current_xp INTEGER NOT NULL DEFAULT 0 CHECK (current_xp >= 0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(owner_id,id)
);
CREATE TABLE north_star (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  motivation TEXT NOT NULL CHECK (length(motivation) BETWEEN 1 AND 1000),
  status TEXT NOT NULL CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(owner_id,id)
);
CREATE TRIGGER north_star_active_insert BEFORE INSERT ON north_star
WHEN NEW.status='active' AND (SELECT count(*) FROM north_star WHERE owner_id=NEW.owner_id AND status='active') >= 3
BEGIN SELECT RAISE(ABORT, 'north_star_active_limit'); END;
CREATE TRIGGER north_star_active_update BEFORE UPDATE OF status ON north_star
WHEN NEW.status='active' AND OLD.status!='active' AND (SELECT count(*) FROM north_star WHERE owner_id=NEW.owner_id AND status='active') >= 3
BEGIN SELECT RAISE(ABORT, 'north_star_active_limit'); END;

CREATE TABLE chapter (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  intent TEXT NOT NULL CHECK (length(intent) BETWEEN 1 AND 2000),
  start_date TEXT NOT NULL, end_date TEXT NOT NULL CHECK (end_date >= start_date),
  status TEXT NOT NULL CHECK (status IN ('draft','active','completed','abandoned')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(owner_id,id)
);
CREATE UNIQUE INDEX one_active_chapter ON chapter(owner_id) WHERE status='active';

CREATE TABLE milestone (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL, title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  done_condition TEXT NOT NULL CHECK (length(done_condition) BETWEEN 1 AND 1000),
  status TEXT NOT NULL CHECK (status IN ('planned','active','completed','replaced','abandoned')),
  target_date TEXT, sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(owner_id,chapter_id) REFERENCES chapter(owner_id,id) ON DELETE CASCADE,
  UNIQUE(owner_id,id)
);
CREATE TABLE balance_guardrail (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('sleep','connection','recovery','novelty','custom')),
  statement TEXT NOT NULL CHECK (length(statement) BETWEEN 1 AND 1000),
  status TEXT NOT NULL CHECK (status IN ('active','paused','archived')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE north_star_aspect (
  owner_id TEXT NOT NULL, north_star_id TEXT NOT NULL, aspect_id TEXT NOT NULL,
  PRIMARY KEY(north_star_id,aspect_id),
  FOREIGN KEY(owner_id,north_star_id) REFERENCES north_star(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,aspect_id) REFERENCES character_aspect(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE chapter_aspect (
  owner_id TEXT NOT NULL, chapter_id TEXT NOT NULL, aspect_id TEXT NOT NULL, emphasis_note TEXT,
  PRIMARY KEY(chapter_id,aspect_id),
  FOREIGN KEY(owner_id,chapter_id) REFERENCES chapter(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,aspect_id) REFERENCES character_aspect(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE milestone_aspect (
  owner_id TEXT NOT NULL, milestone_id TEXT NOT NULL, aspect_id TEXT NOT NULL,
  PRIMARY KEY(milestone_id,aspect_id),
  FOREIGN KEY(owner_id,milestone_id) REFERENCES milestone(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,aspect_id) REFERENCES character_aspect(owner_id,id) ON DELETE CASCADE
);

CREATE TABLE daily_check_in (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL, capacity TEXT NOT NULL CHECK (capacity IN ('low','normal','high')),
  reflection TEXT CHECK (reflection IS NULL OR length(reflection) <= 2000),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(owner_id,local_date)
);
CREATE TABLE quest (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL, title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  done_condition TEXT NOT NULL CHECK (length(done_condition) BETWEEN 1 AND 1000),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  size TEXT NOT NULL CHECK (size IN ('small','standard','major')),
  source TEXT NOT NULL CHECK (source IN ('owner','deterministic')),
  status TEXT NOT NULL CHECK (status IN ('proposed','accepted','declined','completed','attempted','dropped')),
  role TEXT CHECK (role IN ('main','side')), milestone_id TEXT, life_lived INTEGER NOT NULL DEFAULT 0 CHECK (life_lived IN (0,1)),
  repeat_family_key TEXT, accepted_size TEXT CHECK (accepted_size IN ('small','standard','major')), accepted_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(owner_id,milestone_id) REFERENCES milestone(owner_id,id),
  CHECK ((status='accepted' AND accepted_size IS NOT NULL AND accepted_at IS NOT NULL AND role IS NOT NULL) OR status!='accepted'),
  UNIQUE(owner_id,id)
);
CREATE INDEX quest_owner_date_idx ON quest(owner_id,local_date);
CREATE UNIQUE INDEX one_main_quest_per_date ON quest(owner_id,local_date) WHERE status='accepted' AND role='main';
CREATE TRIGGER quest_accepted_insert BEFORE INSERT ON quest
WHEN NEW.status='accepted' AND (SELECT count(*) FROM quest WHERE owner_id=NEW.owner_id AND local_date=NEW.local_date AND status='accepted') >= 3
BEGIN SELECT RAISE(ABORT, 'quest_daily_limit'); END;
CREATE TRIGGER quest_accepted_update BEFORE UPDATE OF status ON quest
WHEN NEW.status='accepted' AND OLD.status!='accepted' AND (SELECT count(*) FROM quest WHERE owner_id=NEW.owner_id AND local_date=NEW.local_date AND status='accepted') >= 3
BEGIN SELECT RAISE(ABORT, 'quest_daily_limit'); END;
CREATE TABLE quest_aspect (
  owner_id TEXT NOT NULL, quest_id TEXT NOT NULL, aspect_id TEXT NOT NULL,
  PRIMARY KEY(quest_id,aspect_id),
  FOREIGN KEY(owner_id,quest_id) REFERENCES quest(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,aspect_id) REFERENCES character_aspect(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE quest_outcome (
  id TEXT PRIMARY KEY NOT NULL, quest_id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('completed','attempted','dropped')),
  occurred_at TEXT NOT NULL, reflection TEXT CHECK (reflection IS NULL OR length(reflection)<=2000),
  accepted_size TEXT NOT NULL CHECK (accepted_size IN ('small','standard','major')),
  FOREIGN KEY(owner_id,quest_id) REFERENCES quest(owner_id,id) ON DELETE CASCADE
);
CREATE TRIGGER quest_outcome_insert AFTER INSERT ON quest_outcome
BEGIN UPDATE quest SET status=NEW.outcome, updated_at=NEW.occurred_at, version=version+1 WHERE id=NEW.quest_id AND owner_id=NEW.owner_id AND status='accepted';
SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'quest_not_resolvable') END; END;
CREATE TRIGGER quest_terminal_update BEFORE UPDATE OF title,done_condition,reason,size,milestone_id ON quest
WHEN OLD.status IN ('completed','attempted','dropped')
BEGIN SELECT RAISE(ABORT,'quest_terminal'); END;

CREATE TABLE briefing (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL, input_fingerprint TEXT NOT NULL, generator_version TEXT NOT NULL,
  generator_kind TEXT NOT NULL CHECK (generator_kind='deterministic'),
  mirror TEXT NOT NULL, tradeoff TEXT, citations_json TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('draft','presented','accepted','superseded','failed')),
  UNIQUE(owner_id,local_date,input_fingerprint,generator_version)
);
CREATE TABLE briefing_suggestion (
  id TEXT PRIMARY KEY NOT NULL, briefing_id TEXT NOT NULL REFERENCES briefing(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL, quest_id TEXT, role TEXT NOT NULL CHECK (role IN ('main','side')), sort_order INTEGER NOT NULL,
  UNIQUE(briefing_id,role,sort_order)
);
CREATE TABLE evidence (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, factual_text TEXT NOT NULL, local_date TEXT NOT NULL, occurred_at TEXT,
  provenance_type TEXT NOT NULL, provenance_id TEXT NOT NULL, confirmed_at TEXT,
  source_snapshot TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(owner_id,id)
);
CREATE TABLE evidence_link (
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL, entity_type TEXT NOT NULL CHECK(entity_type IN ('aspect','milestone','quest')), entity_id TEXT NOT NULL,
  PRIMARY KEY(evidence_id,entity_type,entity_id)
);
CREATE TABLE xp_ledger (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  aspect_id TEXT NOT NULL, evidence_id TEXT NOT NULL, points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 3),
  rule_key TEXT NOT NULL, reason TEXT NOT NULL, awarded_at TEXT NOT NULL,
  FOREIGN KEY(owner_id,aspect_id) REFERENCES character_aspect(owner_id,id),
  FOREIGN KEY(owner_id,evidence_id) REFERENCES evidence(owner_id,id),
  UNIQUE(owner_id,evidence_id,aspect_id,rule_key)
);
CREATE TABLE level_up_candidate (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  aspect_id TEXT NOT NULL, from_level INTEGER NOT NULL, to_level INTEGER NOT NULL,
  threshold_snapshot TEXT NOT NULL, rationale TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('proposed','confirmed','rejected','expired')),
  created_at TEXT NOT NULL, decided_at TEXT,
  FOREIGN KEY(owner_id,aspect_id) REFERENCES character_aspect(owner_id,id)
);
CREATE TABLE weekly_review (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL, recap TEXT NOT NULL, citations_json TEXT NOT NULL,
  recommendations_json TEXT NOT NULL, decisions_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','presented','completed')),
  created_at TEXT NOT NULL, UNIQUE(owner_id,week_start)
);
CREATE TABLE generation_run (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL, generator_kind TEXT NOT NULL CHECK(generator_kind='deterministic'),
  generator_version TEXT NOT NULL, policy_version TEXT NOT NULL, input_hash TEXT NOT NULL, output_hash TEXT,
  status TEXT NOT NULL CHECK(status IN ('started','succeeded','failed')), started_at TEXT NOT NULL, finished_at TEXT, error_class TEXT
);
CREATE TABLE privacy_operation (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('export','delete')), status TEXT NOT NULL,
  requested_at TEXT NOT NULL, completed_at TEXT, manifest_checksum TEXT, error_class TEXT
);
CREATE TABLE observation (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  type TEXT NOT NULL, value_type TEXT NOT NULL CHECK(value_type IN ('number','string','boolean')),
  number_value REAL, string_value TEXT, boolean_value INTEGER CHECK(boolean_value IN (0,1)), unit TEXT,
  observed_start TEXT NOT NULL, observed_end TEXT, ingested_at TEXT NOT NULL,
  provider TEXT NOT NULL, connection_id TEXT NOT NULL, source_record_id TEXT NOT NULL,
  source_revision TEXT NOT NULL, source_type TEXT NOT NULL, confidence REAL CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
  quality_status TEXT NOT NULL CHECK(quality_status IN ('raw','normalized','estimated','corrected')),
  import_batch_id TEXT NOT NULL, adapter_version TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL CHECK(lifecycle_state IN ('active','corrected','deleted')), supersedes_id TEXT REFERENCES observation(id),
  CHECK ((value_type='number' AND number_value IS NOT NULL AND string_value IS NULL AND boolean_value IS NULL)
    OR (value_type='string' AND number_value IS NULL AND string_value IS NOT NULL AND boolean_value IS NULL)
    OR (value_type='boolean' AND number_value IS NULL AND string_value IS NULL AND boolean_value IS NOT NULL)),
  UNIQUE(owner_id,provider,connection_id,source_record_id,source_revision)
);
