-- Replace the connection-local deletion escape hatch with a transactional
-- database guard that works on remote libSQL connections.

CREATE TABLE owner_delete_guard (
  owner_id TEXT PRIMARY KEY NOT NULL
);

CREATE TRIGGER owner_delete_authorized BEFORE DELETE ON owner
WHEN NOT EXISTS (SELECT 1 FROM owner_delete_guard WHERE owner_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'owner_delete_immutable'); END;

DROP TRIGGER quest_accepted_delete;
CREATE TRIGGER quest_accepted_delete BEFORE DELETE ON quest
WHEN OLD.status='accepted'
  AND NOT EXISTS (SELECT 1 FROM owner_delete_guard WHERE owner_id=OLD.owner_id)
BEGIN SELECT RAISE(ABORT, 'quest_accepted_snapshot_immutable'); END;

DROP TRIGGER quest_aspect_immutable_delete;
CREATE TRIGGER quest_aspect_immutable_delete BEFORE DELETE ON quest_aspect
WHEN NOT EXISTS (SELECT 1 FROM owner_delete_guard WHERE owner_id=OLD.owner_id)
  AND EXISTS (SELECT 1 FROM quest WHERE id=OLD.quest_id AND owner_id=OLD.owner_id AND status IN ('accepted','completed','attempted','dropped'))
BEGIN SELECT RAISE(ABORT,'quest_aspect_immutable'); END;

DROP TRIGGER quest_outcome_immutable_delete;
CREATE TRIGGER quest_outcome_immutable_delete BEFORE DELETE ON quest_outcome
WHEN NOT EXISTS (SELECT 1 FROM owner_delete_guard WHERE owner_id=OLD.owner_id)
BEGIN SELECT RAISE(ABORT,'quest_outcome_immutable'); END;

DROP TRIGGER quest_terminal_delete;
CREATE TRIGGER quest_terminal_delete BEFORE DELETE ON quest
WHEN OLD.status IN ('completed','attempted','dropped')
  AND NOT EXISTS (SELECT 1 FROM owner_delete_guard WHERE owner_id=OLD.owner_id)
BEGIN SELECT RAISE(ABORT,'quest_terminal'); END;

DROP TRIGGER evidence_link_immutable_delete;
CREATE TRIGGER evidence_link_immutable_delete BEFORE DELETE ON evidence_link
WHEN NOT EXISTS (SELECT 1 FROM owner_delete_guard WHERE owner_id=OLD.owner_id)
BEGIN SELECT RAISE(ABORT,'evidence_link_immutable'); END;

DROP TRIGGER evidence_immutable_delete;
CREATE TRIGGER evidence_immutable_delete BEFORE DELETE ON evidence
WHEN NOT EXISTS (SELECT 1 FROM owner_delete_guard WHERE owner_id=OLD.owner_id)
BEGIN SELECT RAISE(ABORT,'evidence_immutable'); END;

DROP TRIGGER xp_ledger_immutable_delete;
CREATE TRIGGER xp_ledger_immutable_delete BEFORE DELETE ON xp_ledger
WHEN NOT EXISTS (SELECT 1 FROM owner_delete_guard WHERE owner_id=OLD.owner_id)
BEGIN SELECT RAISE(ABORT,'xp_ledger_immutable'); END;

DROP TRIGGER observation_immutable_delete;
CREATE TRIGGER observation_immutable_delete BEFORE DELETE ON observation
WHEN NOT EXISTS (SELECT 1 FROM owner_delete_guard WHERE owner_id=OLD.owner_id)
BEGIN SELECT RAISE(ABORT,'observation_immutable'); END;
