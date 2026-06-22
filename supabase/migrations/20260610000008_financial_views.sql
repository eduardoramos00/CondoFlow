-- =============================================================
-- Migration: 20260610000008_financial_views.sql
-- Phase 7.1 — Financial Summary View
-- Views: financial_summary
-- Depends on: 20260609000003_financial_schema.sql  (quotas, units)
--             20260610000004_expenses_schema.sql   (expenses)
-- =============================================================


-- =============================================================
-- SUPPORTING INDEXES
-- (created before the view so the planner sees them immediately)
-- =============================================================

-- Covers the monthly_quotas CTE: join unit_id → building_id then
-- filter status IN ('PAID','OVERDUE') and group by due_date month.
-- The existing idx_quotas_status_due_date partial index only covers
-- PENDING + OVERDUE, so a general compound index is added here.
CREATE INDEX IF NOT EXISTS idx_quotas_unit_due_date_status
    ON public.quotas (unit_id, due_date, status);

-- Partial covering index for the monthly_expenses CTE.
-- The existing idx_expenses_building_date covers (building_id, expense_date)
-- but includes all statuses. This partial index limits the scan to only the
-- rows that qualify for financial_summary (APPROVED + RECONCILED).
CREATE INDEX IF NOT EXISTS idx_expenses_building_date_approved
    ON public.expenses (building_id, expense_date)
    WHERE status IN ('APPROVED', 'RECONCILED');


-- =============================================================
-- VIEW: financial_summary
--
-- Aggregates income, expenses, reserve balance, and outstanding
-- debt for every building × calendar-month pair that has at least
-- one qualifying quota or expense row.
--
-- Columns:
--   building_id            — the condominium building
--   month                  — first day of the calendar month (DATE)
--   income_cents           — total PAID quota amounts (amount + reserve)
--   expense_cents          — total APPROVED + RECONCILED expense amounts
--   reserve_balance_cents  — cumulative reserve fund balance up to this month
--                            (running SUM of per-month collected reserve_cents
--                             from PAID quotas, ordered chronologically)
--   outstanding_debt_cents — total OVERDUE quota amounts (amount + reserve)
--
-- SECURITY INVOKER:
--   The view executes with the permissions of the calling session, not the
--   view owner. The existing RLS policies on quotas, units, and expenses
--   therefore apply automatically:
--     GESTOR  → sees all quotas / expenses for buildings they manage
--     CONDÓMINO → quotas RLS limits to own units; expenses RLS limits to
--                 APPROVED + RECONCILED only (Phase 3.1 policy)
--   No additional RLS policy is required on the view itself.
-- =============================================================

CREATE OR REPLACE VIEW public.financial_summary
WITH (security_invoker = true)
AS
WITH monthly_quotas AS (
    -- Aggregate quota income, reserve collected, and outstanding debt
    -- per building per calendar month.
    -- Joining via units is required because quotas.unit_id → units.building_id
    -- is the only path to the building dimension.
    SELECT
        u.building_id,
        date_trunc('month', q.due_date)::DATE                                          AS month,
        COALESCE(SUM(q.amount_cents + q.reserve_cents) FILTER (WHERE q.status = 'PAID'),    0) AS income_cents,
        COALESCE(SUM(q.reserve_cents)                  FILTER (WHERE q.status = 'PAID'),    0) AS reserve_collected_month_cents,
        COALESCE(SUM(q.amount_cents + q.reserve_cents) FILTER (WHERE q.status = 'OVERDUE'), 0) AS outstanding_debt_cents
    FROM public.quotas q
    JOIN public.units u ON u.id = q.unit_id
    GROUP BY u.building_id, date_trunc('month', q.due_date)
),
monthly_expenses AS (
    -- Sum of APPROVED and RECONCILED expenses per building per calendar month.
    -- DRAFT and AWAITING_APPROVAL rows are excluded: they do not represent
    -- confirmed cash outflows yet.
    SELECT
        e.building_id,
        date_trunc('month', e.expense_date)::DATE AS month,
        COALESCE(SUM(e.amount_cents), 0)           AS expense_cents
    FROM public.expenses e
    WHERE e.status IN ('APPROVED', 'RECONCILED')
    GROUP BY e.building_id, date_trunc('month', e.expense_date)
),
all_periods AS (
    -- Merge the distinct building × month combinations from both sources.
    -- A FULL OUTER JOIN alternative would also work, but UNION + LEFT JOINs
    -- is cleaner when adding a third source later (e.g. manual journal entries).
    SELECT building_id, month FROM monthly_quotas
    UNION
    SELECT building_id, month FROM monthly_expenses
),
joined AS (
    SELECT
        ap.building_id,
        ap.month,
        COALESCE(mq.income_cents,                  0) AS income_cents,
        COALESCE(me.expense_cents,                 0) AS expense_cents,
        COALESCE(mq.reserve_collected_month_cents, 0) AS reserve_collected_month_cents,
        COALESCE(mq.outstanding_debt_cents,        0) AS outstanding_debt_cents
    FROM all_periods ap
    LEFT JOIN monthly_quotas   mq ON mq.building_id = ap.building_id AND mq.month = ap.month
    LEFT JOIN monthly_expenses me ON me.building_id = ap.building_id AND me.month = ap.month
)
SELECT
    building_id,
    month,
    income_cents,
    expense_cents,
    -- Cumulative reserve balance: running sum of monthly collected reserves,
    -- partitioned per building and ordered chronologically. This gives the
    -- actual state of the reserve fund at the end of each month.
    SUM(reserve_collected_month_cents)
        OVER (
            PARTITION BY building_id
            ORDER BY month
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )                               AS reserve_balance_cents,
    outstanding_debt_cents
FROM joined
ORDER BY building_id, month;


-- =============================================================
-- GRANT SELECT on the view to the authenticated role so that
-- session-key Supabase clients can query it. The service_role
-- already has unrestricted access.
-- =============================================================

GRANT SELECT ON public.financial_summary TO authenticated;
