ALTER TABLE job_evidence ADD COLUMN mime TEXT NOT NULL DEFAULT 'image/jpeg';
ALTER TABLE job_evidence ADD COLUMN duration REAL NOT NULL DEFAULT 0;
CREATE TABLE evidence_video_chunks (
 evidence_id TEXT NOT NULL REFERENCES job_evidence(id) ON DELETE CASCADE,
 part INTEGER NOT NULL,
 data TEXT NOT NULL,
 PRIMARY KEY(evidence_id,part)
);
