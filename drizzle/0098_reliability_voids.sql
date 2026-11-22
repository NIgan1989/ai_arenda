-- Audit 2026-11-22, «Отзывы и надёжность»: the administrator's answer to an objection can cancel the episodes found
-- wrong (a dispute at checkout, a returned report, a no-show, a cancellation, an unanswered request). The list is kept
-- with the objection as [{"kind":"dispute","id":"<booking id>"},...]; the rating and the booking risk skip them.
ALTER TABLE reliability_objections ADD COLUMN voided TEXT NOT NULL DEFAULT '[]';
CREATE INDEX reliability_objections_voided ON reliability_objections(user_id,role) WHERE voided<>'[]';
