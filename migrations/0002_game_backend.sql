ALTER TABLE quest ADD COLUMN progress_current INTEGER NOT NULL DEFAULT 0 CHECK (progress_current >= 0);
ALTER TABLE quest ADD COLUMN progress_target INTEGER NOT NULL DEFAULT 1 CHECK (progress_target > 0);

-- Terminal quests are immutable at runtime, so temporarily replace the guard
-- while deriving the additive progress representation from preserved status.
DROP TRIGGER IF EXISTS quest_terminal_update;
UPDATE quest SET progress_current=progress_target WHERE status='completed';
CREATE TRIGGER quest_terminal_update BEFORE UPDATE ON quest
WHEN OLD.status IN ('completed','attempted','dropped')
BEGIN SELECT RAISE(ABORT,'quest_terminal'); END;

CREATE TABLE character (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL UNIQUE REFERENCES owner(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(owner_id,id)
);
CREATE TABLE attribute_progress (
  owner_id TEXT NOT NULL, aspect_id TEXT NOT NULL, level INTEGER NOT NULL CHECK(level >= 1),
  xp_into_level INTEGER NOT NULL DEFAULT 0 CHECK(xp_into_level >= 0), total_xp INTEGER NOT NULL DEFAULT 0 CHECK(total_xp >= 0),
  policy_version TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(owner_id,aspect_id),
  FOREIGN KEY(owner_id,aspect_id) REFERENCES character_aspect(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE mission_plan (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL, input_fingerprint TEXT NOT NULL, generator_version TEXT NOT NULL, generated_at TEXT NOT NULL,
  UNIQUE(owner_id,id), UNIQUE(owner_id,local_date,input_fingerprint,generator_version)
);
CREATE TABLE mission (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL, title TEXT NOT NULL, done_condition TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('progress','rest','relationship','exploration')),
  size TEXT NOT NULL CHECK(size IN ('small','standard','major')),
  status TEXT NOT NULL CHECK(status IN ('proposed','accepted','completed','cancelled')),
  source TEXT NOT NULL CHECK(source IN ('owner','generator')), plan_id TEXT,
  quest_id TEXT, chapter_id TEXT, repeat_family_key TEXT,
  accepted_size TEXT CHECK(accepted_size IN ('small','standard','major')), accepted_stretch INTEGER NOT NULL DEFAULT 0 CHECK(accepted_stretch IN (0,1)),
  rationale TEXT, idempotency_key TEXT, accepted_at TEXT, completed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(owner_id,plan_id) REFERENCES mission_plan(owner_id,id),
  FOREIGN KEY(owner_id,quest_id) REFERENCES quest(owner_id,id),
  FOREIGN KEY(owner_id,chapter_id) REFERENCES chapter(owner_id,id),
  UNIQUE(owner_id,id),
  CHECK((status IN ('accepted','completed') AND accepted_size IS NOT NULL AND accepted_at IS NOT NULL) OR status IN ('proposed','cancelled'))
);
CREATE INDEX mission_owner_date_idx ON mission(owner_id,local_date);
CREATE UNIQUE INDEX mission_idempotency_idx ON mission(owner_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TRIGGER mission_transition BEFORE UPDATE OF status ON mission
WHEN NOT (NEW.status=OLD.status OR (OLD.status='proposed' AND NEW.status IN ('accepted','cancelled')) OR (OLD.status='accepted' AND NEW.status='completed'))
BEGIN SELECT RAISE(ABORT,'mission_illegal_transition'); END;
CREATE TRIGGER mission_accepted_snapshot_update BEFORE UPDATE OF owner_id,local_date,title,done_condition,kind,size,source,plan_id,quest_id,chapter_id,repeat_family_key,accepted_size,accepted_stretch,accepted_at ON mission
WHEN OLD.status='accepted' AND NEW.status='accepted'
BEGIN SELECT RAISE(ABORT,'mission_accepted_snapshot_immutable'); END;
CREATE TABLE mission_attribute (
  owner_id TEXT NOT NULL, mission_id TEXT NOT NULL, aspect_id TEXT NOT NULL,
  PRIMARY KEY(owner_id,mission_id,aspect_id),
  FOREIGN KEY(owner_id,mission_id) REFERENCES mission(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,aspect_id) REFERENCES character_aspect(owner_id,id)
);
CREATE TRIGGER mission_attribute_archived BEFORE INSERT ON mission_attribute
WHEN EXISTS(SELECT 1 FROM character_aspect WHERE owner_id=NEW.owner_id AND id=NEW.aspect_id AND archived_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'mission_attribute_archived'); END;
CREATE TRIGGER mission_attribute_immutable_insert BEFORE INSERT ON mission_attribute
WHEN EXISTS(SELECT 1 FROM mission WHERE owner_id=NEW.owner_id AND id=NEW.mission_id AND status IN ('accepted','completed'))
BEGIN SELECT RAISE(ABORT,'mission_attribute_immutable'); END;
CREATE TRIGGER mission_attribute_immutable_update BEFORE UPDATE ON mission_attribute
WHEN EXISTS(SELECT 1 FROM mission WHERE owner_id=OLD.owner_id AND id=OLD.mission_id AND status IN ('accepted','completed'))
BEGIN SELECT RAISE(ABORT,'mission_attribute_immutable'); END;
CREATE TRIGGER mission_attribute_immutable_delete BEFORE DELETE ON mission_attribute
WHEN lifemaxing_owner_delete_allowed()!=1 AND EXISTS(SELECT 1 FROM mission WHERE owner_id=OLD.owner_id AND id=OLD.mission_id AND status IN ('accepted','completed'))
BEGIN SELECT RAISE(ABORT,'mission_attribute_immutable'); END;
CREATE TABLE attribute_xp_award (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL, aspect_id TEXT NOT NULL, points INTEGER NOT NULL CHECK(points >= 0),
  policy_version TEXT NOT NULL, breakdown_json TEXT NOT NULL, local_date TEXT NOT NULL, awarded_at TEXT NOT NULL,
  FOREIGN KEY(owner_id,mission_id) REFERENCES mission(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,aspect_id) REFERENCES character_aspect(owner_id,id),
  UNIQUE(owner_id,id), UNIQUE(owner_id,mission_id,aspect_id)
);
CREATE TRIGGER attribute_xp_award_update BEFORE UPDATE ON attribute_xp_award BEGIN SELECT RAISE(ABORT,'attribute_xp_award_immutable'); END;
CREATE TRIGGER attribute_xp_award_delete BEFORE DELETE ON attribute_xp_award WHEN lifemaxing_owner_delete_allowed()!=1 BEGIN SELECT RAISE(ABORT,'attribute_xp_award_immutable'); END;
CREATE TABLE reward (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT, coin_cost INTEGER NOT NULL CHECK(coin_cost > 0),
  status TEXT NOT NULL CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(owner_id,id)
);
CREATE TABLE reward_redemption (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  reward_id TEXT NOT NULL, coin_cost INTEGER NOT NULL CHECK(coin_cost > 0), title TEXT NOT NULL,
  local_date TEXT NOT NULL, redeemed_at TEXT NOT NULL,
  FOREIGN KEY(owner_id,reward_id) REFERENCES reward(owner_id,id), UNIQUE(owner_id,id)
);
CREATE TABLE coin_ledger (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('award','redeem')), delta INTEGER NOT NULL,
  reason TEXT NOT NULL, mission_id TEXT, redemption_id TEXT, local_date TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(owner_id,mission_id) REFERENCES mission(owner_id,id),
  FOREIGN KEY(owner_id,redemption_id) REFERENCES reward_redemption(owner_id,id),
  CHECK((entry_type='award' AND delta>0) OR (entry_type='redeem' AND delta<0)),
  UNIQUE(owner_id,id), UNIQUE(owner_id,mission_id)
);
CREATE TRIGGER coin_ledger_update BEFORE UPDATE ON coin_ledger BEGIN SELECT RAISE(ABORT,'coin_ledger_immutable'); END;
CREATE TRIGGER coin_ledger_delete BEFORE DELETE ON coin_ledger WHEN lifemaxing_owner_delete_allowed()!=1 BEGIN SELECT RAISE(ABORT,'coin_ledger_immutable'); END;
CREATE TRIGGER reward_redemption_update BEFORE UPDATE ON reward_redemption BEGIN SELECT RAISE(ABORT,'reward_redemption_immutable'); END;
CREATE TRIGGER reward_redemption_delete BEFORE DELETE ON reward_redemption WHEN lifemaxing_owner_delete_allowed()!=1 BEGIN SELECT RAISE(ABORT,'reward_redemption_immutable'); END;
CREATE TABLE achievement_definition (
  key TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, criteria_kind TEXT NOT NULL
);
CREATE TABLE achievement_unlock (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL REFERENCES achievement_definition(key), mission_id TEXT,
  unlocked_at TEXT NOT NULL, FOREIGN KEY(owner_id,mission_id) REFERENCES mission(owner_id,id),
  UNIQUE(owner_id,id), UNIQUE(owner_id,achievement_key)
);
CREATE TRIGGER achievement_unlock_update BEFORE UPDATE ON achievement_unlock BEGIN SELECT RAISE(ABORT,'achievement_unlock_immutable'); END;
CREATE TRIGGER achievement_unlock_delete BEFORE DELETE ON achievement_unlock WHEN lifemaxing_owner_delete_allowed()!=1 BEGIN SELECT RAISE(ABORT,'achievement_unlock_immutable'); END;
CREATE TABLE academic_entry (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES owner(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, title TEXT NOT NULL, course TEXT, term TEXT, due_date TEXT,
  status TEXT CHECK(status IN ('planned','in_progress','done','dropped')),
  score_value TEXT, score_scale TEXT, notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(owner_id,id)
);

INSERT INTO character(id,owner_id,created_at,updated_at,version)
SELECT lower(hex(randomblob(16))),id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),1 FROM owner;
INSERT INTO attribute_progress(owner_id,aspect_id,level,xp_into_level,total_xp,policy_version,updated_at,version)
SELECT owner_id,id,level,0,0,'game-v1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),1 FROM character_aspect;
INSERT INTO achievement_definition(key,title,description,criteria_kind) VALUES
('first_mission','First step','Complete your first mission.','first_mission'),
('first_attribute_level','Level up','Raise any attribute to level 2 or higher.','first_attribute_level'),
('seven_completion_days','Seven days lived','Complete a mission on seven different days.','seven_completion_days');
