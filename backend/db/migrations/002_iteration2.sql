-- ============================================================================
--  Migration 002 — Iteration 2
--
--  * Anonymous device users: the mobile app registers a device (UUID +
--    push token) without an account; email/password become optional and
--    arrive later when the user signs up properly.
--  * schema.sql stays canonical for fresh installs (it already includes
--    these changes); this migration upgrades databases created from the
--    iteration-1 schema.
-- ============================================================================

BEGIN;

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN display_name SET DEFAULT 'ضيف';

ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id UUID UNIQUE;

-- A user must be reachable somehow: real account (email) or device.
ALTER TABLE users ADD CONSTRAINT users_identity_check
    CHECK (email IS NOT NULL OR device_id IS NOT NULL);

COMMIT;
