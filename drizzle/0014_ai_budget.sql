CREATE TABLE ai_budget_preferences (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 daily_request_limit INTEGER NOT NULL DEFAULT 200 CHECK(daily_request_limit BETWEEN 1 AND 1000),
 daily_token_limit INTEGER NOT NULL DEFAULT 500000 CHECK(daily_token_limit BETWEEN 1000 AND 5000000),
 daily_usd_cap_micros INTEGER CHECK(daily_usd_cap_micros IS NULL OR daily_usd_cap_micros BETWEEN 10000 AND 1000000000),
 version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL
);
CREATE TABLE ai_usage_reservations (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES profiles(id),request_key TEXT NOT NULL,day TEXT NOT NULL,
 model TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','completed','rejected','uncertain')),
 reserved_input_tokens INTEGER NOT NULL,reserved_output_tokens INTEGER NOT NULL,
 input_rate REAL,output_rate REAL,reserved_cost_micros INTEGER,
 input_tokens INTEGER,output_tokens INTEGER,charged_tokens INTEGER NOT NULL,charged_cost_micros INTEGER,
 response_id TEXT NOT NULL DEFAULT '',http_status INTEGER,created_at INTEGER NOT NULL,completed_at INTEGER,
 UNIQUE(user_id,request_key)
);
CREATE INDEX ai_usage_day ON ai_usage_reservations(day,user_id);
