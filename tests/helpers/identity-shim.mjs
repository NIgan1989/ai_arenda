// Test participants have attached a photo of their ID card (lib/identity-docs.ts) the moment their profile exists, so
// the older journeys keep testing what they test. Tests of the ID rule itself delete these rows explicitly.
export const IDENTITY_SHIM="CREATE TEMP TRIGGER test_identity_attached AFTER INSERT ON profiles BEGIN INSERT INTO identity_docs(id,user_id,data,width,height,bytes,created_at) VALUES ('test-id-'||NEW.id,NEW.id,'data:image/jpeg;base64,AA==',1,1,1,unixepoch()); END";
