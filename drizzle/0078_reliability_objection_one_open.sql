-- One open objection per participant and role, also when two sends overlap (lib/reliability-objection.ts).
CREATE UNIQUE INDEX reliability_objections_one_open ON reliability_objections(user_id,role) WHERE status='open';
