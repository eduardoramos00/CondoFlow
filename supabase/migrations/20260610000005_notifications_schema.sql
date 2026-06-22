-- =============================================================
-- Migration: 20260610000005_notifications_schema.sql
-- Phase 4.1 — Notification Schema
-- Tables: notifications, notification_preferences
-- Depends on: 20260609000001_core_schema.sql (profiles, buildings)
-- =============================================================


-- =============================================================
-- ENUM TYPES
-- =============================================================

-- notification_event_enum: every platform event that can trigger a notification.
-- Values correspond 1-to-1 with the EmailTemplate enum defined in Phase 4.2
-- (src/lib/notifications/email.ts) and the trigger functions in Phase 4.3.
-- Adding a new event requires a corresponding entry here AND in the app-layer enum.
CREATE TYPE public.notification_event_enum AS ENUM (
    'QUOTA_OVERDUE',
    'QUOTA_REMINDER',
    'ASSEMBLY_SCHEDULED',
    'ASSEMBLY_REMINDER_48H',
    'VOTE_OPEN',
    'INCIDENT_REPORTED',
    'INCIDENT_RESOLVED'
);

-- notification_channel_enum: delivery surface for a notification.
-- IN_APP targets the Realtime bell (Phase 4.4).
-- EMAIL/SMS/PUSH route through the provider adapters (Phase 4.2).
CREATE TYPE public.notification_channel_enum AS ENUM (
    'IN_APP',
    'EMAIL',
    'SMS',
    'PUSH'
);

-- notification_delivery_status_enum: lifecycle state of a single delivery attempt.
-- PENDING  — created, not yet dispatched.
-- SENT     — acknowledged by the downstream provider (or written to Realtime).
-- FAILED   — provider returned an error; retained for retry / audit.
-- READ     — recipient has opened the notification (IN_APP only; other channels use SENT).
CREATE TYPE public.notification_delivery_status_enum AS ENUM (
    'PENDING',
    'SENT',
    'FAILED',
    'READ'
);


-- =============================================================
-- TABLES
-- =============================================================

-- notifications: one row per delivery attempt per channel per recipient.
-- A single platform event (e.g. QUOTA_OVERDUE for unit 3A) will generate
-- N rows — one per active channel in that recipient's notification_preferences.
-- payload holds template variables (e.g. {"amount_cents": 9500, "due_date": "…"})
-- that the provider adapter (Phase 4.2) uses to render the message body.
-- sent_at is NULL until the provider confirms delivery; set atomically with
-- delivery_status → SENT by the service role (Edge Function or server action).
-- INSERT is intentionally restricted to service role (RLS has no INSERT policy
-- for authenticated users). Service role bypasses RLS entirely in Supabase.
CREATE TABLE public.notifications (
    id                  UUID                                    NOT NULL DEFAULT gen_random_uuid(),
    building_id         UUID                                    NOT NULL,
    recipient_user_id   UUID                                    NOT NULL,
    event_type          public.notification_event_enum          NOT NULL,
    channel             public.notification_channel_enum        NOT NULL,
    payload             JSONB                                   NOT NULL DEFAULT '{}',
    sent_at             TIMESTAMPTZ,
    delivery_status     public.notification_delivery_status_enum NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ                             NOT NULL DEFAULT now(),

    CONSTRAINT notifications_pkey                  PRIMARY KEY (id),
    CONSTRAINT notifications_building_id_fkey      FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE,
    -- RESTRICT: deleting a profile must not silently drop notification history.
    -- GDPR erasure (Phase 9.1) anonymises the profile row instead of hard-deleting.
    CONSTRAINT notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);

-- notification_preferences: per-user, per-building channel opt-in/opt-out flags.
-- Composite PK on (user_id, building_id) — one preference row per membership.
-- All channels default to enabled; Condóminos can disable them via the
-- preferences UI in Phase 9.3. The trigger functions (Phase 4.3) query this
-- table before inserting notification rows to avoid creating unwanted deliveries.
-- New rows are created automatically (via service role upsert) when a user gains
-- building membership (Phase 1.3 sign-up / Phase 9.4 onboarding wizard).
CREATE TABLE public.notification_preferences (
    user_id        UUID  NOT NULL,
    building_id    UUID  NOT NULL,
    email_enabled  BOOL  NOT NULL DEFAULT true,
    sms_enabled    BOOL  NOT NULL DEFAULT true,
    push_enabled   BOOL  NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT notification_preferences_pkey            PRIMARY KEY (user_id, building_id),
    CONSTRAINT notification_preferences_user_id_fkey    FOREIGN KEY (user_id)
        REFERENCES public.profiles (id) ON DELETE CASCADE,
    CONSTRAINT notification_preferences_building_id_fkey FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE
);


-- =============================================================
-- TRIGGER FUNCTION: guard immutable columns on notifications
--
-- Recipients may only UPDATE delivery_status (markAsRead flow).
-- All other columns are set once at INSERT by the service role and must
-- not be mutatable by the recipient — including building_id, payload,
-- event_type, and channel. This protects display-layer data integrity
-- even though cross-tenant impact is already blocked by the RLS WITH CHECK.
-- Fires BEFORE UPDATE for each row executed by a non-service-role session.
-- =============================================================

CREATE OR REPLACE FUNCTION public.guard_notification_immutable_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.building_id       IS DISTINCT FROM OLD.building_id
    OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
    OR NEW.event_type        IS DISTINCT FROM OLD.event_type
    OR NEW.channel           IS DISTINCT FROM OLD.channel
    OR NEW.payload           IS DISTINCT FROM OLD.payload
    OR NEW.created_at        IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION
            'Only delivery_status and sent_at may be updated on notifications (notification id: %)',
            OLD.id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER notifications_immutable_columns_trigger
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_notification_immutable_columns();


-- =============================================================
-- TRIGGER FUNCTION: auto-update notification_preferences.updated_at
-- =============================================================

CREATE OR REPLACE FUNCTION public.set_notification_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER notification_preferences_updated_at_trigger
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.set_notification_preferences_updated_at();


-- =============================================================
-- INDEXES (FK join optimisation + query patterns)
-- =============================================================

-- Primary query pattern: NotificationContext (Phase 4.4) subscribes to Realtime
-- filtered by recipient_user_id. This index supports both the initial page load
-- SELECT and the Realtime filter evaluation.
CREATE INDEX idx_notifications_recipient_user_id
    ON public.notifications (recipient_user_id);

-- Bell dropdown query: most recent N notifications for a user, newest first.
CREATE INDEX idx_notifications_recipient_created_at
    ON public.notifications (recipient_user_id, created_at DESC);

-- Partial index: the overdue-quota-sweep Edge Function (Phase 4.3) queries
-- PENDING notifications to avoid re-sending duplicates.
CREATE INDEX idx_notifications_delivery_status_pending
    ON public.notifications (delivery_status)
    WHERE delivery_status = 'PENDING';

-- Gestor / SuperAdmin cross-recipient query by building (Phase 8.3 stats).
CREATE INDEX idx_notifications_building_id
    ON public.notifications (building_id);

-- Event-type filter for analytics and event-specific sweeps.
CREATE INDEX idx_notifications_event_type
    ON public.notifications (event_type);

-- notification_preferences: primary lookup when inserting notifications and
-- when the preferences UI (Phase 9.3) reads the current toggles.
CREATE INDEX idx_notification_preferences_user_id
    ON public.notification_preferences (user_id);

CREATE INDEX idx_notification_preferences_building_id
    ON public.notification_preferences (building_id);


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences  ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- notifications policies
-- Policy naming convention: {table}_{role}_{action}
-- -------------------------------------------------------------

-- Recipients may read their own notification rows.
-- No INSERT policy exists for authenticated users — INSERT is reserved for
-- the service role (Edge Functions, server actions using service-role client).
-- The service role bypasses RLS entirely, so no explicit service-role policy
-- is needed; omitting an INSERT policy for 'authenticated' is sufficient.
CREATE POLICY notifications_recipient_select
    ON public.notifications
    FOR SELECT
    USING (recipient_user_id = auth.uid());

-- Recipients may mark their own IN_APP notifications as READ.
-- The guard_notification_immutable_columns trigger enforces that only
-- delivery_status (and sent_at) can be changed; all other columns are
-- frozen at INSERT by the service role.
CREATE POLICY notifications_recipient_update_status
    ON public.notifications
    FOR UPDATE
    USING (recipient_user_id = auth.uid())
    WITH CHECK (recipient_user_id = auth.uid());


-- -------------------------------------------------------------
-- notification_preferences policies
-- -------------------------------------------------------------

-- Users have full self-service access to their own preference row.
-- INSERT is needed so the Phase 9.4 onboarding wizard (or a server action
-- running under the anon/authenticated role) can seed the default row.
-- The WITH CHECK on building membership prevents a user from creating a
-- preferences row for a building they do not belong to.
CREATE POLICY notification_preferences_self_select
    ON public.notification_preferences
    FOR SELECT
    USING (user_id = auth.uid());

-- Users can seed their own preference row (onboarding wizard, Phase 9.4).
-- The WITH CHECK prevents inserting a row for a building the user has no role in,
-- which would allow preference-row enumeration of buildings.
CREATE POLICY notification_preferences_self_insert
    ON public.notification_preferences
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.user_id     = auth.uid()
              AND ubr.building_id = notification_preferences.building_id
        )
    );

-- Users can toggle their own channel preferences (Phase 9.3 UI).
CREATE POLICY notification_preferences_self_update
    ON public.notification_preferences
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
