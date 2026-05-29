-- ============================================================================
-- 0006 · MFA-bezogene Audit-Aktionen
-- ============================================================================
-- Erweitert das audit_action-Enum um Zwei-Faktor-Ereignisse.
-- ALTER TYPE ... ADD VALUE ist idempotent über IF NOT EXISTS.

alter type public.audit_action add value if not exists 'mfa.enrolled';
alter type public.audit_action add value if not exists 'mfa.verified';
alter type public.audit_action add value if not exists 'mfa.unenrolled';
alter type public.audit_action add value if not exists 'mfa.challenge_failed';

-- Benutzerverwaltung
alter type public.audit_action add value if not exists 'user.created';
alter type public.audit_action add value if not exists 'user.updated';
alter type public.audit_action add value if not exists 'mfa.reset_by_admin';
alter type public.audit_action add value if not exists 'auth.password_changed';
