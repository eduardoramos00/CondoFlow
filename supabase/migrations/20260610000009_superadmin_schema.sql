-- =============================================================
-- Migration: 20260610000009_superadmin_schema.sql
-- Phase 8.1 — SuperAdmin Schema
-- Tables: session_log
-- Gate:   auth.users.app_metadata.role = 'SUPERADMIN' (Supabase Auth admin API)
-- Depends on: 20260609000001_core_schema.sql  (profiles)
--             20260609000001_core_schema.sql  (buildings)
-- =============================================================


-- =============================================================
-- HELPER: SuperAdmin predicate
-- Reads from the JWT app_metadata claim set by Supabase Auth admin API.
-- Using a stable, inlined expression (not a separate function) so that
-- PostgreSQL can hoist it as a constant during plan optimisation.
-- =============================================================

-- session_log: append-only audit trail for every SuperAdmin impersonation or
-- privileged platform action.  No UPDATE or DELETE policies are granted — rows
-- are permanent by design.
CREATE TABLE public.session_log (
    id                    UUID        NOT NULL DEFAULT gen_random_uuid(),
    superadmin_user_id    UUID        NOT NULL,
    impersonated_user_id  UUID            NULL,
    building_id           UUID            NULL,
    action                TEXT        NOT NULL,
    occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT session_log_pkey
        PRIMARY KEY (id),

    CONSTRAINT session_log_superadmin_user_id_fkey
        FOREIGN KEY (superadmin_user_id)
        REFERENCES public.profiles (id)
        ON DELETE RESTRICT,

    CONSTRAINT session_log_impersonated_user_id_fkey
        FOREIGN KEY (impersonated_user_id)
        REFERENCES public.profiles (id)
        ON DELETE RESTRICT,

    CONSTRAINT session_log_building_id_fkey
        FOREIGN KEY (building_id)
        REFERENCES public.buildings (id)
        ON DELETE SET NULL
);

COMMENT ON TABLE  public.session_log IS
    'Append-only audit log for SuperAdmin impersonation and privileged platform actions.';
COMMENT ON COLUMN public.session_log.superadmin_user_id IS
    'The authenticated SuperAdmin who performed the action.';
COMMENT ON COLUMN public.session_log.impersonated_user_id IS
    'The target user being impersonated; NULL for non-impersonation actions.';
COMMENT ON COLUMN public.session_log.building_id IS
    'Building scope of the action when applicable; NULL for platform-wide actions.';
COMMENT ON COLUMN public.session_log.action IS
    'Free-text action descriptor, e.g. "IMPERSONATE_USER", "SUSPEND_USER", "ASSIGN_GESTOR".';


-- =============================================================
-- INDEXES (FK join optimisation)
-- =============================================================

CREATE INDEX idx_session_log_superadmin_user_id
    ON public.session_log (superadmin_user_id);

CREATE INDEX idx_session_log_impersonated_user_id
    ON public.session_log (impersonated_user_id);

CREATE INDEX idx_session_log_building_id
    ON public.session_log (building_id);

-- Time-range queries on the audit trail (most common access pattern)
CREATE INDEX idx_session_log_occurred_at
    ON public.session_log (occurred_at DESC);


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.session_log ENABLE ROW LEVEL SECURITY;

-- Only a SuperAdmin (app_metadata.role = 'SUPERADMIN') may read audit rows.
-- Regular GESTOR / CONDÓMINO users are denied SELECT entirely.
CREATE POLICY session_log_superadmin_select
    ON public.session_log
    FOR SELECT
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN'
    );

-- Only a SuperAdmin may append rows (INSERT).
-- No UPDATE or DELETE policies exist — the table is append-only by design.
CREATE POLICY session_log_superadmin_insert
    ON public.session_log
    FOR INSERT
    WITH CHECK (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN'
        AND superadmin_user_id = auth.uid()
    );


-- =============================================================
-- NOTE: SuperAdmin identity gate
-- The SuperAdmin role is NOT stored in a DB table.  It is managed
-- exclusively via the Supabase Auth admin API by setting:
--
--   auth.users.app_metadata = { "role": "SUPERADMIN" }
--
-- This claim is signed into the JWT and therefore tamper-proof from
-- the client side.  All RLS policies above and the middleware guard
-- in src/middleware.ts read from jwt() -> 'app_metadata' -> 'role'.
-- =============================================================
