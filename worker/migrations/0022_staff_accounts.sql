-- Staff account management + self-service password reset.
--
-- `active` lets the owner deactivate a staff account (a departing staff
-- member, say) without deleting it — audit_log rows keep pointing at a real
-- account rather than an orphaned username. Defaults to 1 so every existing
-- account (the owner, created before this column existed) stays enabled.
--
-- `security_question`/`security_answer_hash`/`security_answer_salt` back the
-- staff "forgot password" flow: staff set one when their account is created,
-- then answer it themselves to set a new password without ever involving the
-- owner's own credentials. The answer is hashed exactly like a password
-- (never stored in plain text) — see hashPassword/verifyPassword in
-- lib/auth.ts, reused as-is for this. All three are nullable: the owner
-- account predates this feature and deliberately has no self-service reset
-- at all (see admin.ts's forgot-password routes — owner is explicitly
-- excluded, that password stays controlled by the ADMIN_PASSWORD repository
-- secret only).
ALTER TABLE admins ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE admins ADD COLUMN security_question TEXT;
ALTER TABLE admins ADD COLUMN security_answer_hash TEXT;
ALTER TABLE admins ADD COLUMN security_answer_salt TEXT;
