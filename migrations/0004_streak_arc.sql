ALTER TABLE chapter ADD COLUMN length_days INTEGER CHECK(length_days > 0);

CREATE TABLE chapter_outcome (
  id TEXT PRIMARY KEY NOT NULL,
  chapter_id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome = 'completed'),
  occurred_at TEXT NOT NULL,
  reflection TEXT,
  FOREIGN KEY(owner_id,chapter_id) REFERENCES chapter(owner_id,id) ON DELETE CASCADE
);
CREATE TRIGGER chapter_outcome_update BEFORE UPDATE ON chapter_outcome
BEGIN SELECT RAISE(ABORT,'chapter_outcome_immutable'); END;
CREATE TRIGGER chapter_outcome_delete BEFORE DELETE ON chapter_outcome
WHEN NOT EXISTS (SELECT 1 FROM owner_delete_guard WHERE owner_id=OLD.owner_id)
BEGIN SELECT RAISE(ABORT,'chapter_outcome_immutable'); END;

INSERT INTO achievement_definition(key,title,description,criteria_kind)
VALUES ('arc_completed','Arc completed','Complete an arc.','arc_completed')
ON CONFLICT(key) DO NOTHING;
