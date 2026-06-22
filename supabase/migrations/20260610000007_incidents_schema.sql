-- =============================================================
-- Migration: 20260610000007_incidents_schema.sql
-- Phase 6.1 — Incident & Ticket Tracking Schema
-- Tables: incidents, incident_attachments, incident_history,
--         supplier_dispatches
-- Depends on: 20260609000001_core_schema.sql  (profiles, buildings, user_building_roles)
--             20260609000002_units_schema.sql  (units)
--             20260610000004_expenses_schema.sql (suppliers)
-- =============================================================


-- =============================================================
-- ENUM TYPES
-- =============================================================

-- incident_status_enum: lifecycle of an incident from first report to closure.
-- REPORTED           — Condómino has submitted the incident; awaiting GESTOR triage.
-- ASSESSED           — GESTOR has reviewed and set a priority level.
-- SUPPLIER_DISPATCHED — GESTOR has scheduled a supplier visit (see supplier_dispatches).
-- IN_PROGRESS        — Remediation work is actively underway.
-- RESOLVED           — Work is complete; pending owner confirmation or close-out.
-- CLOSED             — Terminal state; incident permanently archived.
CREATE TYPE public.incident_status_enum AS ENUM (
    'REPORTED',
    'ASSESSED',
    'SUPPLIER_DISPATCHED',
    'IN_PROGRESS',
    'RESOLVED',
    'CLOSED'
);

-- incident_priority_enum: severity classification set by GESTOR during assessment.
-- NULL on INSERT (not yet assessed); set to a non-NULL value at ASSESSED transition.
CREATE TYPE public.incident_priority_enum AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);


-- =============================================================
-- TRIGGER FUNCTIONS (defined before the tables that reference them)
-- =============================================================

-- set_incident_updated_at: stamps updated_at with the current clock on every
-- UPDATE, without requiring the application layer to pass the value.
-- Fires BEFORE UPDATE on incidents.
CREATE OR REPLACE FUNCTION public.set_incident_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


-- check_incident_status_transition: enforces the legal kanban lifecycle.
--
-- Allowed forward transitions:
--   REPORTED           → ASSESSED | CLOSED
--   ASSESSED           → SUPPLIER_DISPATCHED | IN_PROGRESS | CLOSED
--   SUPPLIER_DISPATCHED → IN_PROGRESS | CLOSED
--   IN_PROGRESS        → RESOLVED | CLOSED
--   RESOLVED           → CLOSED
--   CLOSED             → (terminal — no further transitions)
--
-- No backward transitions are permitted. A resolved incident cannot be
-- re-opened; it must be closed and a new incident filed if needed.
-- CLOSED is the only path that allows bypassing ASSESSED/RESOLVED for
-- direct dismissal (e.g. duplicate or false-alarm reports).
-- Fires BEFORE INSERT OR UPDATE OF status.
CREATE OR REPLACE FUNCTION public.check_incident_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'REPORTED' THEN
            RAISE EXCEPTION
                'Incident initial status must be REPORTED, got %', NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- No-op transitions (updating other columns) are always allowed.
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'REPORTED'            AND NEW.status IN ('ASSESSED', 'CLOSED'))
        OR (OLD.status = 'ASSESSED'           AND NEW.status IN ('SUPPLIER_DISPATCHED', 'IN_PROGRESS', 'CLOSED'))
        OR (OLD.status = 'SUPPLIER_DISPATCHED' AND NEW.status IN ('IN_PROGRESS', 'CLOSED'))
        OR (OLD.status = 'IN_PROGRESS'        AND NEW.status IN ('RESOLVED', 'CLOSED'))
        OR (OLD.status = 'RESOLVED'           AND NEW.status = 'CLOSED')
    ) THEN
        RAISE EXCEPTION
            'Invalid incident status transition: % → % (incident id: %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- guard_incident_history_immutable: incident_history is the legally authoritative
-- audit trail of every status change. Once a row is written, no column may be
-- altered — not the actor, not the statuses, not the comment.
-- The RLS provides no UPDATE policy as a first line of defence; this trigger is
-- defence-in-depth against service-role misuse or direct SQL access.
-- Fires BEFORE UPDATE on incident_history.
CREATE OR REPLACE FUNCTION public.guard_incident_history_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION
        'incident_history rows are immutable — updates are not permitted (row id: %)', OLD.id
        USING ERRCODE = 'check_violation';
END;
$$;


-- enforce_max_incident_attachments: caps attachments at 5 per incident.
-- A CHECK constraint cannot count sibling rows, so a trigger is the only
-- correct mechanism. The count is done with a FOR UPDATE lock on the incident
-- row to prevent two concurrent INSERT requests from both passing the 4→5 check
-- and racing to create a 6th attachment.
-- Fires BEFORE INSERT on incident_attachments.
CREATE OR REPLACE FUNCTION public.enforce_max_incident_attachments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    -- Lock the parent incident row to serialise concurrent attachment inserts.
    PERFORM 1 FROM public.incidents WHERE id = NEW.incident_id FOR UPDATE;

    SELECT COUNT(*)
      INTO v_count
      FROM public.incident_attachments
     WHERE incident_id = NEW.incident_id;

    IF v_count >= 5 THEN
        RAISE EXCEPTION
            'Incident % already has 5 attachments — the maximum is 5 (attempted by user %)',
            NEW.incident_id, NEW.uploaded_by
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- check_supplier_dispatch_building_scope: prevents a GESTOR from linking a
-- supplier_dispatch in Building A to a supplier record that belongs to Building B.
-- The FK on supplier_id only checks existence, not building alignment. Without this
-- guard, a cross-tenant supplier reference would pass the FK and silently leak
-- supplier PII across building boundaries.
-- Fires BEFORE INSERT OR UPDATE OF supplier_id.
CREATE OR REPLACE FUNCTION public.check_supplier_dispatch_building_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_building_id UUID;
    v_incident_building_id UUID;
BEGIN
    SELECT building_id
      INTO v_incident_building_id
      FROM public.incidents
     WHERE id = NEW.incident_id;

    SELECT building_id
      INTO v_supplier_building_id
      FROM public.suppliers
     WHERE id = NEW.supplier_id;

    IF v_supplier_building_id IS DISTINCT FROM v_incident_building_id THEN
        RAISE EXCEPTION
            'Supplier % belongs to building %, cannot be dispatched to an incident in building % (dispatch id: %)',
            NEW.supplier_id, v_supplier_building_id, v_incident_building_id, NEW.id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- =============================================================
-- TABLES
-- =============================================================

-- incidents: root entity for a building defect, fault, or maintenance request.
-- unit_id is nullable: some incidents (e.g. common-area structural faults) are
-- not attributable to a specific unit. When present, unit_id scopes the incident
-- to a unit for which the reporting Condómino has active ownership.
-- priority is NULL on INSERT (REPORTED); must be set by GESTOR at ASSESSED.
-- updated_at is managed by the set_incident_updated_at trigger.
CREATE TABLE public.incidents (
    id           UUID                          NOT NULL DEFAULT gen_random_uuid(),
    building_id  UUID                          NOT NULL,
    unit_id      UUID,
    reported_by  UUID                          NOT NULL,
    title        VARCHAR(300)                  NOT NULL,
    description  TEXT,
    status       public.incident_status_enum   NOT NULL DEFAULT 'REPORTED',
    priority     public.incident_priority_enum,
    created_at   TIMESTAMPTZ                   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ                   NOT NULL DEFAULT now(),

    CONSTRAINT incidents_pkey              PRIMARY KEY (id),
    CONSTRAINT incidents_title_nonempty    CHECK (trim(title) <> ''),
    -- priority must be non-NULL once the incident moves past REPORTED.
    -- The application layer (assessIncident action, Phase 6.2) enforces this.
    -- A DB-level constraint is not added here because priority may legitimately be
    -- NULL for a short window between status update and the subsequent priority SET
    -- when using a single-field UPDATE call. The history table provides the audit trail.
    CONSTRAINT incidents_building_id_fkey  FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE,
    -- RESTRICT: unit archival must not silently delete open incident records.
    CONSTRAINT incidents_unit_id_fkey      FOREIGN KEY (unit_id)
        REFERENCES public.units (id) ON DELETE RESTRICT,
    -- RESTRICT: profile deletion must not erase who reported an incident (legal audit).
    CONSTRAINT incidents_reported_by_fkey  FOREIGN KEY (reported_by)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);


-- incident_attachments: file upload records for photos, videos, or supporting docs.
-- storage_path stores the Supabase Storage object key:
--   incident-media/{building_id}/{incident_id}/{uuid}.{ext}
-- This path convention (Phase 6.2) enables per-incident ACL bucket policies.
-- Maximum 5 attachments per incident is enforced by the enforce_max_incident_attachments trigger.
-- UNIQUE on storage_path: each storage object maps to exactly one attachment record.
CREATE TABLE public.incident_attachments (
    id            UUID         NOT NULL DEFAULT gen_random_uuid(),
    incident_id   UUID         NOT NULL,
    storage_path  VARCHAR(500) NOT NULL,
    mime_type     VARCHAR(100) NOT NULL,
    uploaded_by   UUID         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT incident_attachments_pkey               PRIMARY KEY (id),
    CONSTRAINT incident_attachments_storage_path_unique UNIQUE (storage_path),
    -- CASCADE: deleting an incident removes its media records; orphan storage
    -- objects are cleaned up by a separate storage lifecycle policy.
    CONSTRAINT incident_attachments_incident_id_fkey   FOREIGN KEY (incident_id)
        REFERENCES public.incidents (id) ON DELETE CASCADE,
    -- RESTRICT: profile deletion must not silently orphan uploaded attachments.
    CONSTRAINT incident_attachments_uploaded_by_fkey   FOREIGN KEY (uploaded_by)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);


-- incident_history: append-only audit log of every status transition.
-- One row is written per status change by the transitionIncident action (Phase 6.2).
-- from_status is nullable only for the synthetic REPORTED→REPORTED row that
-- reportIncident() writes on initial creation (no prior status exists).
-- All rows are immutable after INSERT (guard_incident_history_immutable trigger).
CREATE TABLE public.incident_history (
    id              UUID                         NOT NULL DEFAULT gen_random_uuid(),
    incident_id     UUID                         NOT NULL,
    actor_user_id   UUID                         NOT NULL,
    from_status     public.incident_status_enum,
    to_status       public.incident_status_enum  NOT NULL,
    comment         TEXT,
    transitioned_at TIMESTAMPTZ                  NOT NULL DEFAULT now(),

    CONSTRAINT incident_history_pkey             PRIMARY KEY (id),
    -- CASCADE: history is meaningless without the parent incident.
    CONSTRAINT incident_history_incident_id_fkey FOREIGN KEY (incident_id)
        REFERENCES public.incidents (id) ON DELETE CASCADE,
    -- RESTRICT: history must not lose its actor attribution (legal audit trail).
    CONSTRAINT incident_history_actor_fkey       FOREIGN KEY (actor_user_id)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);


-- supplier_dispatches: records a scheduled supplier visit for an incident.
-- A single incident may have multiple dispatch records (e.g. rescheduled visits
-- or different specialist contractors for sub-tasks). There is no UNIQUE constraint
-- on incident_id to allow this pattern.
-- quoted_cost_cents is nullable: a cost estimate may not be available at dispatch time.
-- All monetary amounts are integer cents (DBA mandate §2).
-- The check_supplier_dispatch_building_scope trigger prevents cross-tenant links.
CREATE TABLE public.supplier_dispatches (
    id                UUID        NOT NULL DEFAULT gen_random_uuid(),
    incident_id       UUID        NOT NULL,
    supplier_id       UUID        NOT NULL,
    scheduled_date    DATE        NOT NULL,
    quoted_cost_cents INT,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT supplier_dispatches_pkey                 PRIMARY KEY (id),
    CONSTRAINT supplier_dispatches_cost_positive        CHECK (quoted_cost_cents IS NULL OR quoted_cost_cents > 0),
    CONSTRAINT supplier_dispatches_scheduled_date_valid CHECK (scheduled_date >= '2000-01-01'),
    -- CASCADE: incident deletion removes all its dispatch records.
    CONSTRAINT supplier_dispatches_incident_id_fkey     FOREIGN KEY (incident_id)
        REFERENCES public.incidents (id) ON DELETE CASCADE,
    -- RESTRICT: supplier deactivation must not cascade to delete dispatch history.
    CONSTRAINT supplier_dispatches_supplier_id_fkey     FOREIGN KEY (supplier_id)
        REFERENCES public.suppliers (id) ON DELETE RESTRICT
);


-- =============================================================
-- TRIGGERS
-- =============================================================

CREATE TRIGGER set_incident_updated_at_trigger
    BEFORE UPDATE ON public.incidents
    FOR EACH ROW
    EXECUTE FUNCTION public.set_incident_updated_at();

CREATE TRIGGER check_incident_status_transition_trigger
    BEFORE INSERT OR UPDATE OF status
    ON public.incidents
    FOR EACH ROW
    EXECUTE FUNCTION public.check_incident_status_transition();

-- Fires BEFORE UPDATE — always raises, so the transition trigger above is the
-- only way to mutate incident status (via the status column guard).
CREATE TRIGGER guard_incident_history_immutable_trigger
    BEFORE UPDATE ON public.incident_history
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_incident_history_immutable();

CREATE TRIGGER enforce_max_incident_attachments_trigger
    BEFORE INSERT ON public.incident_attachments
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_max_incident_attachments();

CREATE TRIGGER check_supplier_dispatch_building_scope_trigger
    BEFORE INSERT OR UPDATE OF supplier_id
    ON public.supplier_dispatches
    FOR EACH ROW
    EXECUTE FUNCTION public.check_supplier_dispatch_building_scope();


-- =============================================================
-- INDEXES (FK join optimisation + query patterns)
-- =============================================================

-- incidents
CREATE INDEX idx_incidents_building_id
    ON public.incidents (building_id);

-- Primary filter for Phase 6.3 kanban board: building × status column.
CREATE INDEX idx_incidents_building_status
    ON public.incidents (building_id, status);

-- Condómino view (Phase 6.3 /my-building/incidents): their building, newest first.
CREATE INDEX idx_incidents_building_created_at
    ON public.incidents (building_id, created_at DESC);

-- Phase 6.3 CRITICAL incident quick-scan for mass notification (Phase 6.2).
CREATE INDEX idx_incidents_building_priority
    ON public.incidents (building_id, priority)
    WHERE priority IS NOT NULL;

-- Condómino "my incidents" look-up: filter by reporter.
CREATE INDEX idx_incidents_reported_by
    ON public.incidents (reported_by);

-- unit_id FK index; also enables "incidents for this unit" detail panel.
CREATE INDEX idx_incidents_unit_id
    ON public.incidents (unit_id)
    WHERE unit_id IS NOT NULL;

-- incident_attachments
CREATE INDEX idx_incident_attachments_incident_id
    ON public.incident_attachments (incident_id);

CREATE INDEX idx_incident_attachments_uploaded_by
    ON public.incident_attachments (uploaded_by);

-- incident_history
CREATE INDEX idx_incident_history_incident_id
    ON public.incident_history (incident_id);

-- Timeline display: transitions in chronological order per incident.
CREATE INDEX idx_incident_history_incident_time
    ON public.incident_history (incident_id, transitioned_at ASC);

CREATE INDEX idx_incident_history_actor_user_id
    ON public.incident_history (actor_user_id);

-- supplier_dispatches
CREATE INDEX idx_supplier_dispatches_incident_id
    ON public.supplier_dispatches (incident_id);

CREATE INDEX idx_supplier_dispatches_supplier_id
    ON public.supplier_dispatches (supplier_id);

-- Upcoming-visits calendar query: dispatch date ascending, open incidents only.
CREATE INDEX idx_supplier_dispatches_scheduled_date
    ON public.supplier_dispatches (scheduled_date ASC);


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.incidents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_attachments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_dispatches   ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- incidents policies
-- Policy naming convention: {table}_{role}_{action}
-- -------------------------------------------------------------

-- GESTOR has unrestricted access to all incidents for buildings they manage.
CREATE POLICY incidents_gestor_all
    ON public.incidents
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.incidents.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.incidents.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    );

-- CONDÓMINO can INSERT a new incident only for a unit they actively own in that building.
-- Active ownership is verified by checking unit_ownership.ended_at IS NULL.
-- unit_id may be NULL (common-area incident); in that case the building membership
-- check is the sole guard — the Condómino must still belong to the target building.
CREATE POLICY incidents_condomino_insert
    ON public.incidents
    FOR INSERT
    WITH CHECK (
        reported_by = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.incidents.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'CONDÓMINO'
        )
        AND (
            -- No specific unit claimed: building membership is sufficient.
            public.incidents.unit_id IS NULL
            OR
            -- Unit claimed: reporter must actively own it.
            EXISTS (
                SELECT 1
                FROM public.unit_ownership uo
                WHERE uo.unit_id       = public.incidents.unit_id
                  AND uo.owner_user_id = auth.uid()
                  AND uo.ended_at      IS NULL
            )
        )
    );

-- CONDÓMINO can view all incidents for their building (transparency for shared building health).
-- No priority or status filter: all statuses are visible so Condóminos can track resolution.
CREATE POLICY incidents_condomino_select
    ON public.incidents
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.incidents.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'CONDÓMINO'
        )
    );


-- -------------------------------------------------------------
-- incident_attachments policies
-- -------------------------------------------------------------

-- GESTOR has full access to attachments for incidents in their buildings.
CREATE POLICY incident_attachments_gestor_all
    ON public.incident_attachments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.incident_attachments.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.incident_attachments.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- CONDÓMINO can upload attachments (INSERT) on incidents in their building.
-- The max-5 limit is enforced by the enforce_max_incident_attachments trigger.
-- uploaded_by = auth.uid() prevents spoofing the uploader identity.
CREATE POLICY incident_attachments_condomino_insert
    ON public.incident_attachments
    FOR INSERT
    WITH CHECK (
        uploaded_by = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.incident_attachments.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'CONDÓMINO'
        )
    );

-- CONDÓMINO can view all attachments for incidents in their building.
CREATE POLICY incident_attachments_condomino_select
    ON public.incident_attachments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.incident_attachments.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'CONDÓMINO'
        )
    );


-- -------------------------------------------------------------
-- incident_history policies
-- -------------------------------------------------------------

-- GESTOR can view the full history timeline for incidents in their buildings.
CREATE POLICY incident_history_gestor_select
    ON public.incident_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.incident_history.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- GESTOR may INSERT history rows when transitioning incident status.
-- The actor_user_id must equal auth.uid() to prevent history spoofing.
CREATE POLICY incident_history_gestor_insert
    ON public.incident_history
    FOR INSERT
    WITH CHECK (
        actor_user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.incident_history.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- CONDÓMINO can view the full transition history for incidents in their building,
-- enabling them to track progress through the kanban pipeline.
CREATE POLICY incident_history_condomino_select
    ON public.incident_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.incident_history.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'CONDÓMINO'
        )
    );

-- CONDÓMINO may INSERT history rows only for the initial REPORTED→REPORTED
-- creation event written by reportIncident() (Phase 6.2). from_status NULL
-- marks this special creation entry. No subsequent transitions may be written
-- by a CONDÓMINO — all other transitions require GESTOR role.
CREATE POLICY incident_history_condomino_insert_reported
    ON public.incident_history
    FOR INSERT
    WITH CHECK (
        actor_user_id = auth.uid()
        AND from_status IS NULL
        AND to_status = 'REPORTED'
        AND EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.incident_history.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'CONDÓMINO'
        )
    );


-- -------------------------------------------------------------
-- supplier_dispatches policies
-- -------------------------------------------------------------

-- GESTOR has full access to dispatch records for incidents in their buildings.
CREATE POLICY supplier_dispatches_gestor_all
    ON public.supplier_dispatches
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.supplier_dispatches.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.supplier_dispatches.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- CONDÓMINO can view dispatch records for incidents in their building.
-- Supplier visibility to Condóminos is intentional: owners have a right to
-- know which contractors are scheduled for work in their building.
-- quoted_cost_cents is readable here; GESTOR may choose to omit it at the UI layer.
CREATE POLICY supplier_dispatches_condomino_select
    ON public.supplier_dispatches
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.incidents i
            JOIN public.user_building_roles ubr ON ubr.building_id = i.building_id
            WHERE i.id        = public.supplier_dispatches.incident_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'CONDÓMINO'
        )
    );
