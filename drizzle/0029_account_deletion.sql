CREATE TABLE account_erasure_receipts (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 operation_key TEXT NOT NULL UNIQUE,
 scope TEXT NOT NULL CHECK(scope='active_database_only'),
 erased_at INTEGER NOT NULL
);
CREATE TABLE account_deletion_reviews (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL,
 operator_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('reviewing','needs_action')),
 note TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX account_deletion_review_request ON account_deletion_reviews(request_id,created_at);

-- Opaque UUID fence prevents already-authorized in-flight writes from reviving
-- erased data. It contains no phone, name, contact, credentials or free text.
CREATE TABLE account_erasure_fences (user_id TEXT PRIMARY KEY,erased_at INTEGER NOT NULL);
CREATE TRIGGER account_erased_profiles_insert BEFORE INSERT ON profiles WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_profiles_update BEFORE UPDATE ON profiles WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_auth_accounts_insert BEFORE INSERT ON auth_accounts WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_auth_accounts_update BEFORE UPDATE ON auth_accounts WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_access_receipts_insert BEFORE INSERT ON access_receipts WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_access_receipts_update BEFORE UPDATE ON access_receipts WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_account_preferences_insert BEFORE INSERT ON account_preferences WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_account_preferences_update BEFORE UPDATE ON account_preferences WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_administrator_commands_insert BEFORE INSERT ON administrator_commands WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_administrator_commands_update BEFORE UPDATE ON administrator_commands WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_administrator_issues_insert BEFORE INSERT ON administrator_issues WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.opened_by OR user_id=NEW.other_user) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_administrator_issues_update BEFORE UPDATE ON administrator_issues WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.opened_by OR user_id=NEW.other_user) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_administrator_tasks_insert BEFORE INSERT ON administrator_tasks WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_administrator_tasks_update BEFORE UPDATE ON administrator_tasks WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_ai_budget_preferences_insert BEFORE INSERT ON ai_budget_preferences WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_ai_budget_preferences_update BEFORE UPDATE ON ai_budget_preferences WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_ai_data_permission_events_insert BEFORE INSERT ON ai_data_permission_events WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_ai_data_permission_events_update BEFORE UPDATE ON ai_data_permission_events WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_ai_data_permissions_insert BEFORE INSERT ON ai_data_permissions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_ai_data_permissions_update BEFORE UPDATE ON ai_data_permissions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_ai_usage_reservations_insert BEFORE INSERT ON ai_usage_reservations WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_ai_usage_reservations_update BEFORE UPDATE ON ai_usage_reservations WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_applications_insert BEFORE INSERT ON applications WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_applications_update BEFORE UPDATE ON applications WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_assistant_preferences_insert BEFORE INSERT ON assistant_preferences WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_assistant_preferences_update BEFORE UPDATE ON assistant_preferences WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_audit_events_insert BEFORE INSERT ON audit_events WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.actor_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_audit_events_update BEFORE UPDATE ON audit_events WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.actor_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_auth_mobile_sessions_insert BEFORE INSERT ON auth_mobile_sessions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_auth_mobile_sessions_update BEFORE UPDATE ON auth_mobile_sessions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_auth_sessions_insert BEFORE INSERT ON auth_sessions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_auth_sessions_update BEFORE UPDATE ON auth_sessions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_bookings_insert BEFORE INSERT ON bookings WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.guest_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_bookings_update BEFORE UPDATE ON bookings WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.guest_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_calendar_exports_insert BEFORE INSERT ON calendar_exports WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_calendar_exports_update BEFORE UPDATE ON calendar_exports WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_calendar_previews_insert BEFORE INSERT ON calendar_previews WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_calendar_previews_update BEFORE UPDATE ON calendar_previews WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_calendar_sources_insert BEFORE INSERT ON calendar_sources WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_calendar_sources_update BEFORE UPDATE ON calendar_sources WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaning_jobs_insert BEFORE INSERT ON cleaning_jobs WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.assigned_to) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaning_jobs_update BEFORE UPDATE ON cleaning_jobs WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.assigned_to) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaning_offers_insert BEFORE INSERT ON cleaning_offers WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.worker_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaning_offers_update BEFORE UPDATE ON cleaning_offers WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.worker_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_client_conversations_insert BEFORE INSERT ON client_conversations WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_client_conversations_update BEFORE UPDATE ON client_conversations WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_content_reports_insert BEFORE INSERT ON content_reports WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_content_reports_update BEFORE UPDATE ON content_reports WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_deletion_requests_insert BEFORE INSERT ON deletion_requests WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_deletion_requests_update BEFORE UPDATE ON deletion_requests WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_delivery_channels_insert BEFORE INSERT ON delivery_channels WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_delivery_channels_update BEFORE UPDATE ON delivery_channels WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_delivery_links_insert BEFORE INSERT ON delivery_links WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_delivery_links_update BEFORE UPDATE ON delivery_links WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_delivery_outbox_insert BEFORE INSERT ON delivery_outbox WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_delivery_outbox_update BEFORE UPDATE ON delivery_outbox WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_discussion_blocks_insert BEFORE INSERT ON discussion_blocks WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.blocker_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_discussion_blocks_update BEFORE UPDATE ON discussion_blocks WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.blocker_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_discussion_messages_insert BEFORE INSERT ON discussion_messages WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.sender_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_discussion_messages_update BEFORE UPDATE ON discussion_messages WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.sender_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_discussion_visits_insert BEFORE INSERT ON discussion_visits WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_discussion_visits_update BEFORE UPDATE ON discussion_visits WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_finance_entries_insert BEFORE INSERT ON finance_entries WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.actor_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_finance_entries_update BEFORE UPDATE ON finance_entries WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.actor_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_job_evidence_insert BEFORE INSERT ON job_evidence WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_job_evidence_update BEFORE UPDATE ON job_evidence WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_journey_sessions_insert BEFORE INSERT ON journey_sessions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.sender_id OR user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_journey_sessions_update BEFORE UPDATE ON journey_sessions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.sender_id OR user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_media_insert BEFORE INSERT ON media WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_media_update BEFORE UPDATE ON media WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_messages_insert BEFORE INSERT ON messages WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_messages_update BEFORE UPDATE ON messages WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_moderation_access_events_insert BEFORE INSERT ON moderation_access_events WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.actor_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_moderation_access_events_update BEFORE UPDATE ON moderation_access_events WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.actor_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_notifications_insert BEFORE INSERT ON notifications WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_notifications_update BEFORE UPDATE ON notifications WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_operation_receipts_insert BEFORE INSERT ON operation_receipts WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_operation_receipts_update BEFORE UPDATE ON operation_receipts WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_operator_history_insert BEFORE INSERT ON operator_history WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.actor_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_operator_history_update BEFORE UPDATE ON operator_history WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.actor_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_operator_tickets_insert BEFORE INSERT ON operator_tickets WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.assigned_to) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_operator_tickets_update BEFORE UPDATE ON operator_tickets WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.assigned_to) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_participant_reviews_insert BEFORE INSERT ON participant_reviews WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id OR user_id=NEW.reviewer_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_participant_reviews_update BEFORE UPDATE ON participant_reviews WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id OR user_id=NEW.reviewer_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_payment_intents_insert BEFORE INSERT ON payment_intents WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_payment_intents_update BEFORE UPDATE ON payment_intents WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_phone_verifications_insert BEFORE INSERT ON phone_verifications WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_phone_verifications_update BEFORE UPDATE ON phone_verifications WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_pilot_policy_insert BEFORE INSERT ON pilot_policy WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.updated_by) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_pilot_policy_update BEFORE UPDATE ON pilot_policy WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.updated_by) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_profile_details_insert BEFORE INSERT ON profile_details WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_profile_details_update BEFORE UPDATE ON profile_details WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_profile_preferences_insert BEFORE INSERT ON profile_preferences WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_profile_preferences_update BEFORE UPDATE ON profile_preferences WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_properties_insert BEFORE INSERT ON properties WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.demo_owner) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_properties_update BEFORE UPDATE ON properties WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.demo_owner) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_property_import_links_insert BEFORE INSERT ON property_import_links WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_property_import_links_update BEFORE UPDATE ON property_import_links WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_property_imports_insert BEFORE INSERT ON property_imports WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_property_imports_update BEFORE UPDATE ON property_imports WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_worker_dispatch_insert BEFORE INSERT ON worker_dispatch WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_worker_dispatch_update BEFORE UPDATE ON worker_dispatch WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_account_deletion_reviews_insert BEFORE INSERT ON account_deletion_reviews WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.operator_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_account_deletion_reviews_update BEFORE UPDATE ON account_deletion_reviews WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.operator_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_discussion_rooms_insert BEFORE INSERT ON discussion_rooms WHEN EXISTS(SELECT 1 FROM json_each(NEW.members) m JOIN account_erasure_fences f ON f.user_id=json_extract(m.value,'$.id')) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_background_jobs_insert BEFORE INSERT ON background_jobs WHEN EXISTS(SELECT 1 FROM account_erasure_fences f WHERE f.user_id=NEW.scope OR (json_valid(NEW.payload) AND EXISTS(SELECT 1 FROM json_tree(NEW.payload) j WHERE j.type='text' AND j.atom=f.user_id))) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_administrator_runs_insert BEFORE INSERT ON administrator_runs WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE NEW.id='owner:'||user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_discussion_rooms_update BEFORE UPDATE ON discussion_rooms WHEN EXISTS(SELECT 1 FROM json_each(NEW.members) m JOIN account_erasure_fences f ON f.user_id=json_extract(m.value,'$.id')) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_background_jobs_update BEFORE UPDATE ON background_jobs WHEN EXISTS(SELECT 1 FROM account_erasure_fences f WHERE f.user_id=NEW.scope OR (json_valid(NEW.payload) AND EXISTS(SELECT 1 FROM json_tree(NEW.payload) j WHERE j.type='text' AND j.atom=f.user_id))) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_administrator_runs_update BEFORE UPDATE ON administrator_runs WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE NEW.id='owner:'||user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
