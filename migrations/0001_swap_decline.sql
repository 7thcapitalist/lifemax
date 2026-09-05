-- Allow atomic swap: accepted → declined (clearing acceptance fields in one update).
DROP TRIGGER IF EXISTS quest_transition;
CREATE TRIGGER quest_transition BEFORE UPDATE OF status ON quest
WHEN OLD.status NOT IN ('completed','attempted','dropped') AND NOT (
  NEW.status=OLD.status OR
  (OLD.status='proposed' AND NEW.status IN ('accepted','declined')) OR
  (OLD.status='accepted' AND NEW.status='declined'
    AND NEW.accepted_size IS NULL AND NEW.accepted_at IS NULL AND NEW.role IS NULL) OR
  (OLD.status='accepted' AND NEW.status IN ('completed','attempted','dropped') AND EXISTS (
    SELECT 1 FROM quest_outcome WHERE quest_id=OLD.id AND owner_id=OLD.owner_id AND outcome=NEW.status
  ))
)
BEGIN SELECT RAISE(ABORT, 'quest_illegal_transition'); END;

DROP TRIGGER IF EXISTS quest_accepted_snapshot_update;
CREATE TRIGGER quest_accepted_snapshot_update BEFORE UPDATE OF owner_id,local_date,title,done_condition,reason,size,source,role,milestone_id,life_lived,repeat_family_key,accepted_size,accepted_at ON quest
WHEN OLD.status='accepted' AND NEW.status='accepted'
BEGIN SELECT RAISE(ABORT, 'quest_accepted_snapshot_immutable'); END;
