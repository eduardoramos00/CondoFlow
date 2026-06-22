-- =============================================================
-- Migration: 20260610000010_gdpr_schema.sql
-- Phase 9.1 — GDPR Compliance Schema
-- Tables: gdpr_deletion_requests
-- Depends on: 20260609000001_core_schema.sql  (profiles)
-- =============================================================


-- =============================================================
-- ENUM TYPE
-- =============================================================

-- gdpr_request_status_enum: lifecycle of an erasure request.
-- PENDING     — submitted; awaiting SuperAdmin review.
-- PROCESSING  — SuperAdmin has started anonymisation; in-flight.
-- COMPLETED   — anonymisation finished; completed_at is set.
CREATE TYPE public.gdpr_request_status_enum AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED'
);


-- =============================================================
-- TABLE
-- =============================================================

-- gdpr_deletion_requests: immutable compliance log of every GDPR
-- Article 17 erasure request.  Rows are never deleted — the audit trail
-- must survive even after the subject's PII has been anonymised.
--
-- Anonymisation targets (executed by processDataDeletion in gdpr.ts):
--   auth.users.email            → {uuid_prefix_8}@deleted.condoflow
--   auth.users.user_metadata    → { full_name: 'REDACTED', avatar_url: null }
--   profiles.full_name          → 'REDACTED'
--   profiles.avatar_url         → null
--
-- Intentionally preserved (no PII beyond FK reference):
--   quotas, payments, expenses, audit_log, incident_history, session_log
CREATE TABLE public.gdpr_deletion_requests (
    id                  UUID                            NOT NULL DEFAULT gen_random_uuid(),
    requesting_user_id  UUID                            NOT NULL,
    target_user_id      UUID                            NOT NULL,
    status              public.gdpr_request_status_enum NOT NULL DEFAULT 'PENDING',
    requested_at        TIMESTAMPTZ                     NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ                              NULL,

    CONSTRAINT gdpr_deletion_requests_pkey
        PRIMARY KEY (id),

    CONSTRAINT gdpr_deletion_requests_requesting_user_id_fkey
        FOREIGN KEY (requesting_user_id)
        REFERENCES public.profiles (id)
        ON DELETE RESTRICT,

    CONSTRAINT gdpr_deletion_requests_target_user_id_fkey
        FOREIGN KEY (target_user_id)
        REFERENCES public.profiles (id)
        ON DELETE RESTRICT,

    -- completed_at must be set if and only if status = 'COMPLETED'.
    CONSTRAINT gdpr_deletion_requests_completed_at_consistency
        CHECK (
            (status = 'COMPLETED' AND completed_at IS NOT NULL)
            OR (status <> 'COMPLETED' AND completed_at IS NULL)
        )
);

COMMENT ON TABLE  public.gdpr_deletion_requests IS
    'Immutable audit log of GDPR Art. 17 erasure requests. Never delete rows.';
COMMENT ON COLUMN public.gdpr_deletion_requests.requesting_user_id IS
    'User who submitted the request (may equal target_user_id, or be a SuperAdmin).';
COMMENT ON COLUMN public.gdpr_deletion_requests.target_user_id IS
    'User whose PII will be anonymised. ON DELETE RESTRICT preserves this row even after anonymisation.';
COMMENT ON COLUMN public.gdpr_deletion_requests.completed_at IS
    'Timestamp of successful anonymisation. NULL until status transitions to COMPLETED.';


-- =============================================================
-- INDEXES
-- =============================================================

CREATE INDEX idx_gdpr_deletion_requests_requesting_user_id
    ON public.gdpr_deletion_requests (requesting_user_id);

CREATE INDEX idx_gdpr_deletion_requests_target_user_id
    ON public.gdpr_deletion_requests (target_user_id);

-- Partial index for the duplicate-request guard query (only active rows matter).
CREATE INDEX idx_gdpr_deletion_requests_active
    ON public.gdpr_deletion_requests (target_user_id, status)
    WHERE status IN ('PENDING', 'PROCESSING');


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.gdpr_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Users can read their own requests (as requester or as subject).
-- SuperAdmins can read all rows.
CREATE POLICY gdpr_deletion_requests_select
    ON public.gdpr_deletion_requests
    FOR SELECT
    USING (
        requesting_user_id = auth.uid()
        OR target_user_id  = auth.uid()
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN'
    );

-- Authenticated users may submit a request only for their own data.
-- SuperAdmins may submit on behalf of any user.
-- In both cases the requesting_user_id must match the authenticated caller.
CREATE POLICY gdpr_deletion_requests_insert
    ON public.gdpr_deletion_requests
    FOR INSERT
    WITH CHECK (
        requesting_user_id = auth.uid()
        AND (
            target_user_id = auth.uid()
            OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN'
        )
    );

-- Only SuperAdmins may advance the status (PENDING → PROCESSING → COMPLETED).
-- Regular users cannot retract or modify a submitted request.
CREATE POLICY gdpr_deletion_requests_superadmin_update
    ON public.gdpr_deletion_requests
    FOR UPDATE
    USING  ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'SUPERADMIN');

-- No DELETE policy — rows are permanent compliance evidence.
