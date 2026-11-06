// The authoritative database is the complete, append-only SQL migration history.
// Drizzle Kit snapshots do not describe our handwritten triggers/data migrations.
// Refuse generation/push rather than calculate DROP statements from partial ORM declarations.
throw new Error('Drizzle Kit schema generation/push is disabled for this project. Add a new drizzle/NNNN_name.sql migration, then run node scripts/schema-snapshot.mjs --write and node scripts/verify-local.mjs. Existing migrations are immutable. See docs/SCHEMA_WORKFLOW.md.');

export default {};
