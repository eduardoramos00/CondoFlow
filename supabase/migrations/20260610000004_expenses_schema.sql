-- =============================================================
-- Migration: 20260610000004_expenses_schema.sql
-- Phase 3.1 — Expense & Supplier Schema
-- Tables: suppliers, documents, expenses
-- Depends on: 20260609000003_financial_schema.sql
-- =============================================================


-- =============================================================
-- ENUM TYPES
-- =============================================================

-- Note: expense category reuses public.budget_category_enum defined in
-- migration 003. That type was explicitly designed as a shared enum for
-- both budget line items and expenses, enabling cross-phase financial
-- reporting aggregation without duplicating or splitting the domain.

CREATE TYPE public.document_status_enum AS ENUM (
    'PROCESSING',
    'DRAFT',
    'LINKED'
);

CREATE TYPE public.expense_status_enum AS ENUM (
    'DRAFT',
    'AWAITING_APPROVAL',
    'APPROVED',
    'RECONCILED'
);


-- =============================================================
-- TRIGGER FUNCTION: enforce expense status transition order
--
-- Allowed moves (approval lifecycle):
--   DRAFT             → AWAITING_APPROVAL | APPROVED
--   AWAITING_APPROVAL → APPROVED
--   APPROVED          → RECONCILED
--   RECONCILED        → (terminal — no further transitions)
--
-- DRAFT → APPROVED is permitted for direct GESTOR self-approval (Phase 3.3).
-- A rejection/recall path (AWAITING_APPROVAL → DRAFT) is intentionally excluded
-- until Phase 3.3 explicitly designs that flow.
-- Fires BEFORE INSERT OR UPDATE OF status to abort illegal moves before commit.
-- =============================================================

CREATE OR REPLACE FUNCTION public.check_expense_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'DRAFT' THEN
            RAISE EXCEPTION
                'Expense initial status must be DRAFT, got %', NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- No-op transition is always allowed (UPDATE touching other columns).
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'DRAFT'             AND NEW.status IN ('AWAITING_APPROVAL', 'APPROVED'))
        OR (OLD.status = 'AWAITING_APPROVAL' AND NEW.status = 'APPROVED')
        OR (OLD.status = 'APPROVED'          AND NEW.status = 'RECONCILED')
    ) THEN
        RAISE EXCEPTION
            'Invalid expense status transition: % → % (expense id: %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- =============================================================
-- TABLES
-- =============================================================

-- suppliers: building-scoped supplier/vendor directory.
-- PII columns (name, nif, contact_email) are tagged for GDPR anonymisation in Phase 9.
-- is_active enables soft deletion: deactivated suppliers remain FK-referenceable
-- by existing expense records but are excluded from new expense creation UIs.
CREATE TABLE public.suppliers (
    id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    building_id     UUID         NOT NULL,
    name            VARCHAR(200) NOT NULL, -- PII
    nif             VARCHAR(20),           -- PII
    contact_email   VARCHAR(200),          -- PII
    service_type    VARCHAR(100) NOT NULL,
    is_active       BOOL         NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT suppliers_pkey             PRIMARY KEY (id),
    CONSTRAINT suppliers_building_id_fkey FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE
);

-- documents: file upload records for invoices and supporting receipts.
-- storage_path stores the Supabase Storage object key:
--   invoices/{building_id}/{year}/{month}/{uuid}.{ext}
-- ocr_payload is populated by the Edge Function (Phase 3.2); NULL until DRAFT.
-- Status transitions: PROCESSING (on upload) → DRAFT (after OCR stub) → LINKED (when expense.document_id is set).
-- file_size_bytes is capped at 10 MB to match the invoices bucket policy set in Phase 0.2.
CREATE TABLE public.documents (
    id               UUID                        NOT NULL DEFAULT gen_random_uuid(),
    building_id      UUID                        NOT NULL,
    storage_path     VARCHAR(500)                NOT NULL,
    mime_type        VARCHAR(100)                NOT NULL,
    file_size_bytes  INT                         NOT NULL,
    status           public.document_status_enum NOT NULL DEFAULT 'PROCESSING',
    ocr_payload      JSONB,
    uploaded_by      UUID                        NOT NULL,
    created_at       TIMESTAMPTZ                 NOT NULL DEFAULT now(),

    CONSTRAINT documents_pkey               PRIMARY KEY (id),
    -- Each storage object must map to exactly one document record.
    CONSTRAINT documents_storage_path_unique UNIQUE (storage_path),
    CONSTRAINT documents_file_size_positive CHECK (file_size_bytes > 0),
    -- 10 485 760 bytes = 10 MiB — mirrors the storage bucket hard limit.
    CONSTRAINT documents_file_size_max      CHECK (file_size_bytes <= 10485760),
    CONSTRAINT documents_building_id_fkey   FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE,
    -- RESTRICT: profile deletion must not silently orphan uploaded documents.
    -- GDPR erasure anonymises the profile row rather than cascading deletes.
    CONSTRAINT documents_uploaded_by_fkey   FOREIGN KEY (uploaded_by)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);

-- expenses: financial obligation record for a building expense event.
-- document_id is nullable: expenses may be entered without an attached invoice
-- (e.g. direct bank transfers where no PDF is available).
-- approved_by / approved_at are nullable columns set atomically when status
-- transitions to APPROVED; the check_expense_status_transition trigger and the
-- expenses_approval_consistency constraint together enforce this invariant.
-- category reuses budget_category_enum for cross-phase aggregation in Phase 7.
-- All monetary amounts are stored as integer cents — see DBA mandate §2.
CREATE TABLE public.expenses (
    id            UUID                        NOT NULL DEFAULT gen_random_uuid(),
    building_id   UUID                        NOT NULL,
    document_id   UUID,
    supplier_id   UUID                        NOT NULL,
    category      public.budget_category_enum NOT NULL,
    amount_cents  INT                         NOT NULL,
    expense_date  DATE                        NOT NULL,
    description   TEXT,
    status        public.expense_status_enum  NOT NULL DEFAULT 'DRAFT',
    approved_by   UUID,
    approved_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ                 NOT NULL DEFAULT now(),

    CONSTRAINT expenses_pkey             PRIMARY KEY (id),
    CONSTRAINT expenses_amount_positive  CHECK (amount_cents > 0),
    -- approved_by and approved_at must always be set or cleared together.
    CONSTRAINT expenses_approval_pair_consistency CHECK (
        (approved_by IS NULL AND approved_at IS NULL)
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    -- When status is APPROVED or RECONCILED the approval pair must be populated.
    -- The server action (Phase 3.3) must set both fields in the same UPDATE.
    CONSTRAINT expenses_approval_status_consistency CHECK (
        (status IN ('APPROVED', 'RECONCILED')
            AND approved_by IS NOT NULL
            AND approved_at IS NOT NULL)
        OR status NOT IN ('APPROVED', 'RECONCILED')
    ),
    CONSTRAINT expenses_building_id_fkey  FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE,
    -- SET NULL: document deletion (storage eviction) must not cascade to expenses.
    CONSTRAINT expenses_document_id_fkey  FOREIGN KEY (document_id)
        REFERENCES public.documents (id) ON DELETE SET NULL,
    -- RESTRICT: deactivating a supplier must not silently delete expense history.
    CONSTRAINT expenses_supplier_id_fkey  FOREIGN KEY (supplier_id)
        REFERENCES public.suppliers (id) ON DELETE RESTRICT,
    -- RESTRICT: profile deletion must not erase financial approval attribution.
    CONSTRAINT expenses_approved_by_fkey  FOREIGN KEY (approved_by)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);


-- =============================================================
-- TRIGGER FUNCTION: enforce expense.document_id building scope
--
-- Prevents a GESTOR from linking an expense in Building A to a document
-- that was uploaded into Building B. Without this guard, the FK constraint
-- only checks existence — not building_id alignment — which would allow a
-- cross-tenant document reference that the CONDÓMINO RLS policy could then
-- expose to users in the wrong building.
-- Fires BEFORE INSERT OR UPDATE OF document_id.
-- =============================================================

CREATE OR REPLACE FUNCTION public.check_expense_document_building()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_document_building_id UUID;
BEGIN
    -- NULL document_id is allowed (invoice-less expense).
    IF NEW.document_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT building_id
      INTO v_document_building_id
      FROM public.documents
     WHERE id = NEW.document_id;

    IF v_document_building_id IS DISTINCT FROM NEW.building_id THEN
        RAISE EXCEPTION
            'document % belongs to building %, cannot be linked to an expense in building % (expense id: %)',
            NEW.document_id, v_document_building_id, NEW.building_id, NEW.id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- =============================================================
-- EXPENSE STATUS TRANSITION TRIGGER
-- =============================================================

CREATE TRIGGER check_expense_status_transition_trigger
    BEFORE INSERT OR UPDATE OF status
    ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.check_expense_status_transition();


-- =============================================================
-- EXPENSE DOCUMENT BUILDING SCOPE TRIGGER
-- =============================================================

CREATE TRIGGER check_expense_document_building_trigger
    BEFORE INSERT OR UPDATE OF document_id
    ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.check_expense_document_building();


-- =============================================================
-- INDEXES (FK join optimisation + query patterns)
-- =============================================================

CREATE INDEX idx_suppliers_building_id
    ON public.suppliers (building_id);

-- Partial index for the most common query: active supplier dropdown on expense form.
CREATE INDEX idx_suppliers_building_active
    ON public.suppliers (building_id)
    WHERE is_active = true;

CREATE INDEX idx_documents_building_id
    ON public.documents (building_id);

CREATE INDEX idx_documents_uploaded_by
    ON public.documents (uploaded_by);

-- Edge Function status sweep: find all PROCESSING documents pending OCR.
CREATE INDEX idx_documents_status
    ON public.documents (status)
    WHERE status = 'PROCESSING';

CREATE INDEX idx_expenses_building_id
    ON public.expenses (building_id);

-- Primary filter pattern for Phase 3.3 expense table: building + status.
CREATE INDEX idx_expenses_building_status
    ON public.expenses (building_id, status);

-- Category breakdown queries for Phase 7.2 ExpenseByCategoryChart.
CREATE INDEX idx_expenses_building_category
    ON public.expenses (building_id, category);

CREATE INDEX idx_expenses_supplier_id
    ON public.expenses (supplier_id);

-- Partial index: only linked expenses have a non-null document_id.
CREATE INDEX idx_expenses_document_id
    ON public.expenses (document_id)
    WHERE document_id IS NOT NULL;

-- Date-range filter for Phase 7.1 financial_summary view and expense report PDF.
CREATE INDEX idx_expenses_building_date
    ON public.expenses (building_id, expense_date DESC);


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses  ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- suppliers policies
-- Policy naming convention: {table}_{role}_{action}
-- -------------------------------------------------------------

-- GESTOR has unrestricted access to suppliers for buildings they manage.
CREATE POLICY suppliers_gestor_all
    ON public.suppliers
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.suppliers.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.suppliers.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    );

-- CONDÓMINO can view all suppliers for their building (read-only transparency).
-- No mutation policy is created — Condóminos never create or edit suppliers.
CREATE POLICY suppliers_condomino_select_own
    ON public.suppliers
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.suppliers.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'CONDÓMINO'
        )
    );


-- -------------------------------------------------------------
-- documents policies
-- -------------------------------------------------------------

-- GESTOR has full access to all documents within their buildings.
CREATE POLICY documents_gestor_all
    ON public.documents
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.documents.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.documents.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    );

-- CONDÓMINO can view documents that are linked to an APPROVED or RECONCILED expense
-- in their building. Direct SELECT on PROCESSING/DRAFT documents is blocked —
-- invoice content must not be visible before GESTOR approval.
-- The explicit documents.building_id = ubr.building_id guard is defence-in-depth:
-- the check_expense_document_building trigger already prevents cross-building links
-- at write time, but the policy must not rely solely on that invariant holding.
-- Join path: document → expense (APPROVED|RECONCILED) → building → role.
CREATE POLICY documents_condomino_select_approved
    ON public.documents
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.expenses e
            JOIN public.user_building_roles ubr
              ON ubr.building_id = e.building_id
            WHERE e.document_id              = public.documents.id
              AND public.documents.building_id = ubr.building_id
              AND e.status                   IN ('APPROVED', 'RECONCILED')
              AND ubr.user_id                = auth.uid()
              AND ubr.role                   = 'CONDÓMINO'
        )
    );


-- -------------------------------------------------------------
-- expenses policies
-- -------------------------------------------------------------

-- GESTOR has unrestricted access to all expenses for their buildings.
CREATE POLICY expenses_gestor_all
    ON public.expenses
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.expenses.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.expenses.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    );

-- CONDÓMINO can read APPROVED and RECONCILED expenses for their building.
-- DRAFT and AWAITING_APPROVAL expenses are hidden until the GESTOR approves —
-- this prevents premature disclosure of unapproved financial commitments.
CREATE POLICY expenses_condomino_select_approved
    ON public.expenses
    FOR SELECT
    USING (
        status IN ('APPROVED', 'RECONCILED')
        AND EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.expenses.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'CONDÓMINO'
        )
    );
