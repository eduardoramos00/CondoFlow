-- =============================================================
-- Migration: 20260610000011_onboarding_invitations.sql
-- Phase 9.4 — Onboarding Flow
-- Tables: building_invitations
-- Depends on: 20260609000001_core_schema.sql (buildings, profiles),
--             20260609000002_units_schema.sql (units)
-- =============================================================

-- Tracks pending email invitations sent by a GESTOR during the building
-- creation wizard. When the invited user registers via the magic link, the
-- updated handle_new_user trigger auto-assigns CONDÓMINO role without any
-- additional server-side action.

CREATE TABLE public.building_invitations (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    building_id UUID        NOT NULL,
    email       TEXT        NOT NULL,
    unit_id     UUID,
    status      TEXT        NOT NULL DEFAULT 'PENDING',
    invited_by  UUID        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT building_invitations_pkey PRIMARY KEY (id),
    CONSTRAINT building_invitations_status_check
        CHECK (status IN ('PENDING', 'ACCEPTED')),
    CONSTRAINT building_invitations_building_id_fkey FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE,
    CONSTRAINT building_invitations_unit_id_fkey FOREIGN KEY (unit_id)
        REFERENCES public.units (id) ON DELETE SET NULL,
    CONSTRAINT building_invitations_invited_by_fkey FOREIGN KEY (invited_by)
        REFERENCES public.profiles (id) ON DELETE CASCADE,
    -- One invite per (building, email): re-invite just upserts and resets status.
    CONSTRAINT building_invitations_unique_per_building_email
        UNIQUE (building_id, email)
);

-- Accelerates the trigger lookup (email + status filter on sign-up path).
CREATE INDEX idx_building_invitations_email_status
    ON public.building_invitations (LOWER(email), status);

CREATE INDEX idx_building_invitations_building_id
    ON public.building_invitations (building_id);


-- =============================================================
-- UPDATE handle_new_user — extend to process pending invitations
-- =============================================================
-- Replaces the function from migration 001 in-place (CREATE OR REPLACE).
-- Steps added here (2 and 3) execute atomically with the profile INSERT,
-- so there is never a window where a user exists without their role rows.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Create profile (original behaviour from migration 001)
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;

    -- 2. Mark all PENDING invitations for this email as ACCEPTED
    UPDATE public.building_invitations
    SET    status     = 'ACCEPTED'
    WHERE  LOWER(email) = LOWER(NEW.email)
      AND  status       = 'PENDING';

    -- 3. Insert CONDÓMINO role rows for every now-accepted invitation
    INSERT INTO public.user_building_roles (user_id, building_id, role)
    SELECT NEW.id, bi.building_id, 'CONDÓMINO'
    FROM   public.building_invitations bi
    WHERE  LOWER(bi.email) = LOWER(NEW.email)
      AND  bi.status       = 'ACCEPTED'
    ON CONFLICT (user_id, building_id) DO NOTHING;

    RETURN NEW;
END;
$$;


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.building_invitations ENABLE ROW LEVEL SECURITY;

-- GESTOR may read and manage all invitations for buildings they manage.
CREATE POLICY building_invitations_gestor_all
    ON public.building_invitations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.building_invitations.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.building_invitations.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    );
