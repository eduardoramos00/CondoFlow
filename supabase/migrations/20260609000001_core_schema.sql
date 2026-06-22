-- =============================================================
-- Migration: 20260609000001_core_schema.sql
-- Phase 1.1 — Auth, RBAC & Multi-Tenant Core
-- Tables: profiles, buildings, user_building_roles
-- =============================================================


-- =============================================================
-- ENUM TYPES
-- =============================================================

CREATE TYPE public.user_role_enum AS ENUM ('GESTOR', 'CONDÓMINO');


-- =============================================================
-- TABLES
-- =============================================================

-- profiles: extends auth.users with application-level metadata.
-- Populated automatically via handle_new_user trigger on sign-up.
CREATE TABLE public.profiles (
    id          UUID        NOT NULL,
    full_name   TEXT,                                           -- PII
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id)
        REFERENCES auth.users (id) ON DELETE CASCADE
);

COMMENT ON COLUMN public.profiles.full_name IS 'PII — personal data subject to GDPR deletion request';

-- buildings: master multi-tenant root entity.
-- Every downstream table carries a building_id FK back to this table.
CREATE TABLE public.buildings (
    id                UUID        NOT NULL DEFAULT gen_random_uuid(),
    name              TEXT        NOT NULL,
    address           TEXT        NOT NULL,
    fiscal_number     VARCHAR(20) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    owner_gestor_id   UUID        NOT NULL,

    CONSTRAINT buildings_pkey PRIMARY KEY (id),
    CONSTRAINT buildings_fiscal_number_unique UNIQUE (fiscal_number),
    CONSTRAINT buildings_owner_gestor_id_fkey FOREIGN KEY (owner_gestor_id)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);

-- user_building_roles: maps a profile to a building with exactly one role.
-- Composite PK enforces one role per (user, building) pair.
CREATE TABLE public.user_building_roles (
    user_id     UUID                NOT NULL,
    building_id UUID                NOT NULL,
    role        public.user_role_enum NOT NULL,
    created_at  TIMESTAMPTZ         NOT NULL DEFAULT now(),

    CONSTRAINT user_building_roles_pkey PRIMARY KEY (user_id, building_id),
    CONSTRAINT user_building_roles_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.profiles (id) ON DELETE CASCADE,
    CONSTRAINT user_building_roles_building_id_fkey FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE
);


-- =============================================================
-- INDEXES (FK join optimisation)
-- =============================================================

CREATE INDEX idx_buildings_owner_gestor_id
    ON public.buildings (owner_gestor_id);

CREATE INDEX idx_user_building_roles_user_id
    ON public.user_building_roles (user_id);

CREATE INDEX idx_user_building_roles_building_id
    ON public.user_building_roles (building_id);

-- Covering index: fast lookup of all buildings a given user manages
CREATE INDEX idx_user_building_roles_user_role
    ON public.user_building_roles (user_id, role);


-- =============================================================
-- TRIGGER: auto-create profile on auth.users INSERT
-- Runs as SECURITY DEFINER to bypass RLS on profiles insert.
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Auto-assign the building owner as GESTOR in user_building_roles on building creation.
-- Without this, buildings_gestor_select would never match (policy depends on the role row).
-- Runs as SECURITY DEFINER to bypass RLS on user_building_roles (no INSERT policy exists
-- for the authenticated role — role assignments are service-role-only by design).
CREATE OR REPLACE FUNCTION public.handle_new_building()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_building_roles (user_id, building_id, role)
    VALUES (NEW.owner_gestor_id, NEW.id, 'GESTOR')
    ON CONFLICT (user_id, building_id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_building_created
    AFTER INSERT ON public.buildings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_building();


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_building_roles ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- profiles policies
-- Policy naming convention: {table}_{role}_{action}
-- -------------------------------------------------------------

-- A user may read only their own profile row.
CREATE POLICY profiles_self_select
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- A user may insert only their own profile row (fallback if trigger fails).
CREATE POLICY profiles_self_insert
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- A user may update only their own profile row.
CREATE POLICY profiles_self_update
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Any authenticated user may read profiles of people who share at least one building.
-- Required for Phase 1.3+: GESTORs listing condómino names, condóminos seeing gestor info.
CREATE POLICY profiles_building_member_select
    ON public.profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles my_roles
            JOIN public.user_building_roles their_roles
              ON their_roles.building_id = my_roles.building_id
            WHERE my_roles.user_id   = auth.uid()
              AND their_roles.user_id = public.profiles.id
        )
    );


-- -------------------------------------------------------------
-- buildings policies
-- -------------------------------------------------------------

-- A GESTOR can read any building they manage.
-- Multiple permissive SELECT policies are OR-combined by PostgreSQL.
CREATE POLICY buildings_gestor_select
    ON public.buildings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.buildings.id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    );

-- A CONDÓMINO can read any building they are a resident of.
-- Policy name uses ASCII-only identifier to avoid pg_dump / CI encoding issues.
CREATE POLICY buildings_condomino_select_own
    ON public.buildings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.buildings.id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'CONDÓMINO'
        )
    );

-- A GESTOR can insert a building where they are the declared owner.
CREATE POLICY buildings_gestor_insert
    ON public.buildings
    FOR INSERT
    WITH CHECK (owner_gestor_id = auth.uid());

-- A GESTOR can update only buildings they manage (confirmed via role table).
CREATE POLICY buildings_gestor_update
    ON public.buildings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.buildings.id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.buildings.id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    );


-- -------------------------------------------------------------
-- user_building_roles policies
-- -------------------------------------------------------------

-- A user may read only their own role assignments.
-- This also ensures the subqueries inside buildings policies above
-- are correctly scoped: each user sees only their own rows.
CREATE POLICY user_building_roles_self_select
    ON public.user_building_roles
    FOR SELECT
    USING (user_id = auth.uid());
