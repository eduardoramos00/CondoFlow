-- =============================================================
-- Migration: 20260609000002_units_schema.sql
-- Phase 1.2 — Unit & Ownership Schema
-- Tables: units, unit_ownership
-- Depends on: 20260609000001_core_schema.sql
-- =============================================================


-- =============================================================
-- TRIGGER FUNCTION: enforce permilagem sum ≤ 10 000 per building
--
-- Fires BEFORE INSERT OR UPDATE OF permilagem, building_id so it only
-- runs when the values that affect the sum actually change.
--
-- Key invariant: in a BEFORE trigger the NEW row is not yet committed.
-- For INSERT  → id != NEW.id is always true for existing rows (UUID is
--               generated before BEFORE triggers run), so we sum all
--               other units in the building and add NEW.permilagem.
-- For UPDATE  → id != NEW.id excludes the current row, which still
--               holds the OLD permilagem in the table at this point.
-- Both cases use the same WHERE clause — no TG_OP branching needed.
-- =============================================================

CREATE OR REPLACE FUNCTION public.check_permilagem_sum()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_other_sum INT;
BEGIN
    -- Acquire a row-level lock on the parent building to serialise concurrent
    -- unit inserts/updates for the same building. Without this lock, two
    -- simultaneous transactions each read the pre-commit sum, both pass the
    -- check independently, and both commit — pushing the total over 10 000.
    -- The lock is released automatically when the transaction ends.
    PERFORM 1 FROM public.buildings WHERE id = NEW.building_id FOR UPDATE;

    SELECT COALESCE(SUM(permilagem), 0)
    INTO v_other_sum
    FROM public.units
    WHERE building_id = NEW.building_id
      AND id          != NEW.id;

    IF v_other_sum + NEW.permilagem > 10000 THEN
        RAISE EXCEPTION
            'Permilagem sum for building % would be % — must not exceed 10000 (buildings must total exactly 10000)',
            NEW.building_id,
            v_other_sum + NEW.permilagem
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- =============================================================
-- TABLES
-- =============================================================

-- units: physical fractions of a building (apartments, parking, storage).
-- identifier follows the Portuguese convention: "2ºC", "1ºA", "Cave 1".
CREATE TABLE public.units (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    building_id UUID        NOT NULL,
    identifier  VARCHAR(30) NOT NULL,
    floor       INT         NOT NULL,
    permilagem  INT         NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT units_pkey PRIMARY KEY (id),
    -- Each identifier must be unique within a building
    CONSTRAINT units_building_identifier_unique UNIQUE (building_id, identifier),
    -- permilagem must be a positive integer; a single unit cannot exceed the total
    CONSTRAINT units_permilagem_positive CHECK (permilagem > 0),
    CONSTRAINT units_permilagem_max      CHECK (permilagem <= 10000),
    CONSTRAINT units_building_id_fkey FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE
);

-- unit_ownership: tracks full historical ownership chain per unit.
-- ended_at IS NULL means the ownership is currently active.
-- Partial unique index below ensures at most one active owner per unit.
CREATE TABLE public.unit_ownership (
    id             UUID NOT NULL DEFAULT gen_random_uuid(),
    unit_id        UUID NOT NULL,
    owner_user_id  UUID NOT NULL,
    started_at     DATE NOT NULL,
    ended_at       DATE,

    CONSTRAINT unit_ownership_pkey PRIMARY KEY (id),
    -- ended_at must be after started_at when set
    CONSTRAINT unit_ownership_date_order CHECK (ended_at IS NULL OR ended_at > started_at),
    CONSTRAINT unit_ownership_unit_id_fkey FOREIGN KEY (unit_id)
        REFERENCES public.units (id) ON DELETE CASCADE,
    -- RESTRICT prevents deleting a profile that still has ownership records;
    -- GDPR deletion uses anonymisation (Phase 9) rather than hard deletes.
    CONSTRAINT unit_ownership_owner_user_id_fkey FOREIGN KEY (owner_user_id)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);

-- Partial unique index: only one active (ended_at IS NULL) owner per unit.
-- A historical chain is allowed; only the live record is constrained.
CREATE UNIQUE INDEX idx_unit_ownership_one_active_owner
    ON public.unit_ownership (unit_id)
    WHERE ended_at IS NULL;


-- =============================================================
-- PERMILAGEM TRIGGER
-- =============================================================

CREATE TRIGGER check_permilagem_sum_trigger
    BEFORE INSERT OR UPDATE OF permilagem, building_id
    ON public.units
    FOR EACH ROW
    EXECUTE FUNCTION public.check_permilagem_sum();


-- =============================================================
-- INDEXES (FK join optimisation)
-- =============================================================

CREATE INDEX idx_units_building_id
    ON public.units (building_id);

CREATE INDEX idx_unit_ownership_unit_id
    ON public.unit_ownership (unit_id);

CREATE INDEX idx_unit_ownership_owner_user_id
    ON public.unit_ownership (owner_user_id);

-- Covering index: look up the current active owner of a unit in one scan
CREATE INDEX idx_unit_ownership_active
    ON public.unit_ownership (unit_id, owner_user_id)
    WHERE ended_at IS NULL;


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.units         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_ownership ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- units policies
-- Policy naming convention: {table}_{role}_{action}
-- -------------------------------------------------------------

-- GESTOR has unrestricted access to all units in buildings they manage.
-- FOR ALL covers SELECT, INSERT, UPDATE, DELETE with a single policy;
-- WITH CHECK mirrors USING so insert/update are equally restricted.
CREATE POLICY units_gestor_all
    ON public.units
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.units.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.units.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    );

-- CONDOMINO can SELECT any unit they appear in unit_ownership for
-- (active or historical) — required for quota history views (Phase 2.5).
CREATE POLICY units_condomino_select_own
    ON public.units
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.unit_ownership uo
            WHERE uo.unit_id       = public.units.id
              AND uo.owner_user_id = auth.uid()
        )
    );


-- -------------------------------------------------------------
-- unit_ownership policies
-- -------------------------------------------------------------

-- GESTOR has unrestricted access to ownership records for their buildings.
-- The join through units is required to scope by building.
CREATE POLICY unit_ownership_gestor_all
    ON public.unit_ownership
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.units u
            JOIN public.user_building_roles ubr
              ON ubr.building_id = u.building_id
            WHERE u.id         = public.unit_ownership.unit_id
              AND ubr.user_id  = auth.uid()
              AND ubr.role     = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.units u
            JOIN public.user_building_roles ubr
              ON ubr.building_id = u.building_id
            WHERE u.id        = unit_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- CONDOMINO can read their own ownership records (active and historical).
CREATE POLICY unit_ownership_condomino_select_own
    ON public.unit_ownership
    FOR SELECT
    USING (owner_user_id = auth.uid());
