-- =============================================================
-- Migration: 20260609000003_financial_schema.sql
-- Phase 2.1 — Financial Ledger Schema
-- Tables: budgets, budget_line_items, quotas, payments, audit_log
-- Depends on: 20260609000002_units_schema.sql
-- =============================================================


-- =============================================================
-- ENUM TYPES
-- =============================================================

CREATE TYPE public.budget_status_enum AS ENUM (
    'DRAFT',
    'APPROVED'
);

-- Shared category set for both budget line items and (Phase 3) expenses.
-- Fixed enum enforces clean reporting aggregation — no free-text categories.
CREATE TYPE public.budget_category_enum AS ENUM (
    'MAINTENANCE',
    'WATER',
    'ELECTRICITY',
    'INSURANCE',
    'CLEANING',
    'ELEVATOR',
    'ADMINISTRATIVE',
    'OTHER'
);

CREATE TYPE public.quota_status_enum AS ENUM (
    'PENDING',
    'PAID',
    'OVERDUE',
    'WAIVED'
);


-- =============================================================
-- TRIGGER FUNCTION: enforce quota status transition order
--
-- Allowed moves (Decreto-Lei n.º 268/94 lifecycle):
--   PENDING  → PAID | OVERDUE | WAIVED
--   OVERDUE  → PAID | WAIVED
--   PAID     → (terminal — no further transitions)
--   WAIVED   → (terminal — no further transitions)
--
-- No backwards transitions (e.g. PAID → PENDING) are permitted.
-- Fires BEFORE UPDATE OF status to abort illegal moves before commit.
-- =============================================================

CREATE OR REPLACE FUNCTION public.check_quota_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Initial status must be PENDING on insert.
        IF NEW.status <> 'PENDING' THEN
            RAISE EXCEPTION
                'Quota initial status must be PENDING, got %', NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- No-op transition is always allowed (UPDATE touching other columns).
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Enforce the allowed forward transitions.
    IF NOT (
        (OLD.status = 'PENDING' AND NEW.status IN ('PAID', 'OVERDUE', 'WAIVED'))
        OR (OLD.status = 'OVERDUE' AND NEW.status IN ('PAID', 'WAIVED'))
    ) THEN
        RAISE EXCEPTION
            'Invalid quota status transition: % → % (quota id: %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- =============================================================
-- TABLES
-- =============================================================

-- budgets: one annual budget per building per fiscal year.
-- All monetary columns are integers representing euro cents — no FLOAT/DECIMAL ever.
-- fiscal_year stores the 4-digit calendar year (e.g. 2026).
CREATE TABLE public.budgets (
    id                    UUID                      NOT NULL DEFAULT gen_random_uuid(),
    building_id           UUID                      NOT NULL,
    fiscal_year           INT                       NOT NULL,
    total_amount_cents    INT                       NOT NULL,
    reserve_amount_cents  INT                       NOT NULL,
    status                public.budget_status_enum NOT NULL DEFAULT 'DRAFT',
    created_by            UUID                      NOT NULL,
    created_at            TIMESTAMPTZ               NOT NULL DEFAULT now(),

    CONSTRAINT budgets_pkey PRIMARY KEY (id),
    -- One budget per building per fiscal year.
    CONSTRAINT budgets_building_year_unique       UNIQUE (building_id, fiscal_year),
    CONSTRAINT budgets_fiscal_year_valid          CHECK (fiscal_year BETWEEN 2000 AND 2100),
    CONSTRAINT budgets_total_amount_positive      CHECK (total_amount_cents > 0),
    CONSTRAINT budgets_reserve_amount_non_negative CHECK (reserve_amount_cents >= 0),
    -- Declarative guard: reserve must not exceed the total budget.
    CONSTRAINT budgets_reserve_le_total           CHECK (reserve_amount_cents <= total_amount_cents),
    CONSTRAINT budgets_building_id_fkey FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE,
    CONSTRAINT budgets_created_by_fkey  FOREIGN KEY (created_by)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);

-- budget_line_items: individual expense categories within an annual budget.
-- The sum of line items should equal budgets.total_amount_cents (enforced at
-- the application layer in Phase 2.4 — not a DB constraint to allow incremental editing).
CREATE TABLE public.budget_line_items (
    id              UUID                        NOT NULL DEFAULT gen_random_uuid(),
    budget_id       UUID                        NOT NULL,
    category        public.budget_category_enum NOT NULL,
    amount_cents    INT                         NOT NULL,
    description     TEXT,

    CONSTRAINT budget_line_items_pkey            PRIMARY KEY (id),
    CONSTRAINT budget_line_items_amount_positive CHECK (amount_cents > 0),
    CONSTRAINT budget_line_items_budget_id_fkey  FOREIGN KEY (budget_id)
        REFERENCES public.budgets (id) ON DELETE CASCADE
);

-- quotas: per-unit monthly contribution generated from an approved budget.
-- amount_cents and reserve_cents are immutable snapshots of the calculated values
-- at generation time — they must not be updated after a PAID or WAIVED status.
-- The UNIQUE on (unit_id, due_date) prevents duplicate monthly generation runs.
CREATE TABLE public.quotas (
    id              UUID                     NOT NULL DEFAULT gen_random_uuid(),
    unit_id         UUID                     NOT NULL,
    budget_id       UUID                     NOT NULL,
    due_date        DATE                     NOT NULL,
    amount_cents    INT                      NOT NULL,
    reserve_cents   INT                      NOT NULL,
    status          public.quota_status_enum NOT NULL DEFAULT 'PENDING',
    paid_at         TIMESTAMPTZ,

    CONSTRAINT quotas_pkey                  PRIMARY KEY (id),
    -- Prevents duplicate quota rows for the same unit + month.
    CONSTRAINT quotas_unit_due_date_unique  UNIQUE (unit_id, due_date),
    CONSTRAINT quotas_amount_positive       CHECK (amount_cents > 0),
    CONSTRAINT quotas_reserve_non_negative  CHECK (reserve_cents >= 0),
    -- paid_at must be set when PAID and null for all other statuses.
    CONSTRAINT quotas_paid_at_consistency   CHECK (
        (status = 'PAID' AND paid_at IS NOT NULL)
        OR (status <> 'PAID' AND paid_at IS NULL)
    ),
    CONSTRAINT quotas_unit_id_fkey   FOREIGN KEY (unit_id)
        REFERENCES public.units (id) ON DELETE RESTRICT,
    CONSTRAINT quotas_budget_id_fkey FOREIGN KEY (budget_id)
        REFERENCES public.budgets (id) ON DELETE RESTRICT
);

-- payments: immutable record of a financial settlement against a quota.
-- Multiple partial payments per quota are permitted (phase 2.5 aggregates them).
-- payment_method stores free-form method strings (e.g. "MB WAY", "Transferência").
CREATE TABLE public.payments (
    id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    quota_id        UUID         NOT NULL,
    amount_cents    INT          NOT NULL,
    paid_by         UUID         NOT NULL,
    payment_method  VARCHAR(50)  NOT NULL,
    reference       VARCHAR(100),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT payments_pkey            PRIMARY KEY (id),
    CONSTRAINT payments_amount_positive CHECK (amount_cents > 0),
    CONSTRAINT payments_quota_id_fkey   FOREIGN KEY (quota_id)
        REFERENCES public.quotas (id) ON DELETE RESTRICT,
    -- RESTRICT prevents profile deletion if payment records exist;
    -- GDPR deletion uses field anonymisation (Phase 9) rather than hard deletes.
    CONSTRAINT payments_paid_by_fkey    FOREIGN KEY (paid_by)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);

-- audit_log: append-only event log for all mutations to financial records.
--
-- building_id is included even though the spec lists only the minimum columns.
-- It is architecturally required for tenant-scoped RLS SELECT policies —
-- without it, per-building scoping would require dynamic joins across every
-- financial table via target_table/target_id, which is not feasible in a
-- static RLS expression.
--
-- APPEND-ONLY ENFORCEMENT: two BEFORE triggers (below) raise an exception on
-- any UPDATE or DELETE attempt. Triggers fire before the statement executes and
-- cannot be bypassed by BYPASSRLS (the service_role Postgres role in Supabase).
-- RLS alone is insufficient: service_role bypasses all RLS policies.
-- actor_user_id is nullable to support system/cron-triggered events.
CREATE TABLE public.audit_log (
    id               UUID         NOT NULL DEFAULT gen_random_uuid(),
    actor_user_id    UUID,
    building_id      UUID,
    action           VARCHAR(100) NOT NULL,
    target_table     VARCHAR(100) NOT NULL,
    target_id        UUID         NOT NULL,
    before_snapshot  JSONB,
    after_snapshot   JSONB,
    occurred_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT audit_log_pkey         PRIMARY KEY (id),
    -- ON DELETE SET NULL: actor account deletion must not erase audit history.
    CONSTRAINT audit_log_actor_fkey   FOREIGN KEY (actor_user_id)
        REFERENCES public.profiles (id) ON DELETE SET NULL,
    -- ON DELETE SET NULL: building deletion must not erase audit history.
    CONSTRAINT audit_log_building_fkey FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE SET NULL
);


-- =============================================================
-- TRIGGER: enforce audit_log append-only invariant
--
-- Fires BEFORE UPDATE and BEFORE DELETE on audit_log.
-- Unlike RLS policies, triggers run regardless of the caller's Postgres role —
-- they block mutations even when called via the service_role (BYPASSRLS) client.
-- This is the only mechanism that guarantees tamper-evidence at the DB level.
-- =============================================================

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION
        'audit_log is append-only: % operations are not permitted (row id: %)',
        TG_OP, OLD.id
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON public.audit_log
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_audit_log_mutation();

CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON public.audit_log
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_audit_log_mutation();


-- =============================================================
-- QUOTA STATUS TRANSITION TRIGGER
-- =============================================================

CREATE TRIGGER check_quota_status_transition_trigger
    BEFORE INSERT OR UPDATE OF status
    ON public.quotas
    FOR EACH ROW
    EXECUTE FUNCTION public.check_quota_status_transition();


-- =============================================================
-- INDEXES (FK join optimisation + query patterns)
-- =============================================================

CREATE INDEX idx_budgets_building_id
    ON public.budgets (building_id);

-- Covers the common query: find the approved budget for a building+year.
CREATE INDEX idx_budgets_building_year_status
    ON public.budgets (building_id, fiscal_year, status);

CREATE INDEX idx_budget_line_items_budget_id
    ON public.budget_line_items (budget_id);

CREATE INDEX idx_quotas_unit_id
    ON public.quotas (unit_id);

CREATE INDEX idx_quotas_budget_id
    ON public.quotas (budget_id);

-- Overdue sweep (Phase 4.3): efficiently find PENDING/OVERDUE quotas past due_date.
CREATE INDEX idx_quotas_status_due_date
    ON public.quotas (status, due_date)
    WHERE status IN ('PENDING', 'OVERDUE');

CREATE INDEX idx_payments_quota_id
    ON public.payments (quota_id);

CREATE INDEX idx_payments_paid_by
    ON public.payments (paid_by);

CREATE INDEX idx_audit_log_building_id
    ON public.audit_log (building_id);

CREATE INDEX idx_audit_log_actor_user_id
    ON public.audit_log (actor_user_id);

CREATE INDEX idx_audit_log_target
    ON public.audit_log (target_table, target_id);

-- Descending on occurred_at matches the typical "most recent events first" UI query.
CREATE INDEX idx_audit_log_occurred_at
    ON public.audit_log (occurred_at DESC);


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.budgets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log         ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- budgets policies
-- Policy naming convention: {table}_{role}_{action}
-- -------------------------------------------------------------

-- GESTOR has unrestricted access (SELECT, INSERT, UPDATE, DELETE) to budgets
-- for every building they manage.
-- WITH CHECK additionally enforces created_by = auth.uid() on INSERT to prevent
-- a GESTOR from forging the creator attribution in the audit trail.
-- UPDATE does not re-evaluate created_by (it is set once on INSERT); a GESTOR
-- updating a budget they did not create is permitted by design (e.g. approved
-- by a different manager), but they cannot change created_by to another user
-- because that column should be treated as immutable at the application layer.
CREATE POLICY budgets_gestor_all
    ON public.budgets
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.budgets.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.budgets.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
        -- On INSERT, the creator must be the authenticated user.
        AND (created_by = auth.uid())
    );

-- CONDÓMINO can read budgets for any building they are a member of.
-- Required for Phase 2.5: Condómino views their quota breakdown vs. the approved budget.
CREATE POLICY budgets_condomino_select_own
    ON public.budgets
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.budgets.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'CONDÓMINO'
        )
    );


-- -------------------------------------------------------------
-- budget_line_items policies
-- -------------------------------------------------------------

-- GESTOR has full access to line items for budgets in their buildings.
-- The join resolves: line_item → budget → building → role.
CREATE POLICY budget_line_items_gestor_all
    ON public.budget_line_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.budgets b
            JOIN public.user_building_roles ubr
              ON ubr.building_id = b.building_id
            WHERE b.id        = public.budget_line_items.budget_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.budgets b
            JOIN public.user_building_roles ubr
              ON ubr.building_id = b.building_id
            WHERE b.id        = public.budget_line_items.budget_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- CONDÓMINO can read line items for budgets in their building (transparency mandate).
CREATE POLICY budget_line_items_condomino_select_own
    ON public.budget_line_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.budgets b
            JOIN public.user_building_roles ubr
              ON ubr.building_id = b.building_id
            WHERE b.id        = public.budget_line_items.budget_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'CONDÓMINO'
        )
    );


-- -------------------------------------------------------------
-- quotas policies
-- -------------------------------------------------------------

-- GESTOR has unrestricted access to quotas for units in their buildings.
-- Join path: quota → unit → building → user_building_roles.
CREATE POLICY quotas_gestor_all
    ON public.quotas
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.units u
            JOIN public.user_building_roles ubr
              ON ubr.building_id = u.building_id
            WHERE u.id        = public.quotas.unit_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.units u
            JOIN public.user_building_roles ubr
              ON ubr.building_id = u.building_id
            WHERE u.id        = public.quotas.unit_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- CONDÓMINO can read quotas for units they own (active or historical ownership).
-- Covers Phase 2.5 payment history view for /my-building/payments.
CREATE POLICY quotas_condomino_select_own
    ON public.quotas
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.unit_ownership uo
            WHERE uo.unit_id       = public.quotas.unit_id
              AND uo.owner_user_id = auth.uid()
        )
    );


-- -------------------------------------------------------------
-- payments policies
-- -------------------------------------------------------------

-- GESTOR has unrestricted access to payments for their buildings.
-- Join path: payment → quota → unit → building → user_building_roles.
CREATE POLICY payments_gestor_all
    ON public.payments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.quotas q
            JOIN public.units u
              ON u.id = q.unit_id
            JOIN public.user_building_roles ubr
              ON ubr.building_id = u.building_id
            WHERE q.id        = public.payments.quota_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.quotas q
            JOIN public.units u
              ON u.id = q.unit_id
            JOIN public.user_building_roles ubr
              ON ubr.building_id = u.building_id
            WHERE q.id        = public.payments.quota_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- CONDÓMINO can read their own payment records.
CREATE POLICY payments_condomino_select_own
    ON public.payments
    FOR SELECT
    USING (paid_by = auth.uid());


-- -------------------------------------------------------------
-- audit_log policies
--
-- APPEND-ONLY DESIGN: no UPDATE or DELETE policy is created.
-- Any INSERT via an authenticated (session-key) client requires the
-- WITH CHECK below. Server actions that use createServerSupabaseClient()
-- (service role) bypass RLS entirely and can always insert.
-- -------------------------------------------------------------

-- GESTOR can SELECT audit entries scoped to their buildings.
-- building_id on audit_log is the RLS anchor — see table comment above.
-- NOTE: rows where building_id IS NULL (system/cron-triggered events) are
-- never matched by this EXISTS subquery (NULL comparisons are never true in SQL).
-- Those entries are intentionally invisible to session-key clients and are
-- accessible only via the service-role client used by the SuperAdmin portal (Phase 8).
CREATE POLICY audit_log_gestor_select
    ON public.audit_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.audit_log.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    );

-- Authenticated users (server actions running under session key) may INSERT
-- audit entries only for buildings they belong to, and may only name themselves
-- as the actor. Service-role writes (Phase 2.4+ server actions) bypass RLS but
-- are still subject to the append-only triggers above.
-- Policy name uses "self" to follow the {table}_{role}_{action} convention.
CREATE POLICY audit_log_self_insert
    ON public.audit_log
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        -- Prevent actor_user_id forgery: caller may only claim their own UID or NULL.
        AND (actor_user_id = auth.uid() OR actor_user_id IS NULL)
        AND (
            building_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.user_building_roles ubr
                WHERE ubr.building_id = public.audit_log.building_id
                  AND ubr.user_id     = auth.uid()
            )
        )
    );
