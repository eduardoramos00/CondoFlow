-- =============================================================
-- Migration: 20260610000006_assemblies_schema.sql
-- Phase 5.1 — Assembly & Digital Voting Hub Schema
-- Tables: assemblies, agenda_items, votes, vote_proxies, atas
-- Depends on: 20260609000001_core_schema.sql (profiles, buildings)
--             20260609000002_units_schema.sql (units, unit_ownership)
-- =============================================================


-- =============================================================
-- ENUM TYPES
-- =============================================================

-- assembly_type_enum: Portuguese condominium law distinguishes between
-- ordinary (annual, mandatory) and extraordinary (called as needed) assemblies.
CREATE TYPE public.assembly_type_enum AS ENUM (
    'ORDINÁRIA',
    'EXTRAORDINÁRIA'
);

-- assembly_status_enum: lifecycle of an assembly from creation to archival.
-- DRAFT       — created by GESTOR; not yet visible to Condóminos.
-- PUBLISHED   — agenda confirmed; owners notified (Phase 4.3 trigger fires here).
-- IN_PROGRESS — active session; voting buttons are live for Condóminos.
-- CONCLUDED   — session closed; ata can be finalised; results are visible.
-- ARCHIVED    — permanently closed; read-only; no further state changes permitted.
CREATE TYPE public.assembly_status_enum AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'IN_PROGRESS',
    'CONCLUDED',
    'ARCHIVED'
);

-- agenda_item_voting_status_enum: per-item voting lifecycle.
-- CLOSED    — voting not yet opened for this item (default).
-- OPEN      — GESTOR has opened voting; Condóminos may cast votes.
-- CONCLUDED — GESTOR has closed voting; results are final and immutable.
CREATE TYPE public.agenda_item_voting_status_enum AS ENUM (
    'CLOSED',
    'OPEN',
    'CONCLUDED'
);

-- vote_choice_enum: valid vote options conforming to Portuguese assembly law.
CREATE TYPE public.vote_choice_enum AS ENUM (
    'FAVOR',
    'AGAINST',
    'ABSTAIN'
);

-- ata_status_enum: lifecycle of the formal meeting minutes document.
-- DRAFT     — GESTOR is composing the ata via the Tiptap editor (Phase 5.3).
-- FINALIZED — GESTOR has signed off; ata is immutable and visible to Condóminos.
CREATE TYPE public.ata_status_enum AS ENUM (
    'DRAFT',
    'FINALIZED'
);


-- =============================================================
-- TRIGGER FUNCTIONS (defined before the tables that reference them)
-- =============================================================

-- check_assembly_status_transition: enforce the legal assembly lifecycle.
-- Allowed transitions:
--   DRAFT       → PUBLISHED | ARCHIVED
--   PUBLISHED   → IN_PROGRESS | ARCHIVED
--   IN_PROGRESS → CONCLUDED
--   CONCLUDED   → ARCHIVED
--   ARCHIVED    → (terminal — no further transitions)
-- No backward transitions are permitted; a concluded assembly cannot be reopened.
-- Phase 5.2 transitionAssemblyStatus() must use the service-role client; this
-- trigger fires regardless of the calling role and provides defence-in-depth.
CREATE OR REPLACE FUNCTION public.check_assembly_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'DRAFT' THEN
            RAISE EXCEPTION
                'Assembly initial status must be DRAFT, got %', NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- No-op transitions (updating other columns) are always allowed.
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'DRAFT'       AND NEW.status IN ('PUBLISHED',   'ARCHIVED'))
        OR (OLD.status = 'PUBLISHED'   AND NEW.status IN ('IN_PROGRESS', 'ARCHIVED'))
        OR (OLD.status = 'IN_PROGRESS' AND NEW.status = 'CONCLUDED')
        OR (OLD.status = 'CONCLUDED'   AND NEW.status = 'ARCHIVED')
    ) THEN
        RAISE EXCEPTION
            'Invalid assembly status transition: % → % (assembly id: %)',
            OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- check_agenda_item_voting_status_transition: enforce per-item voting lifecycle.
-- Allowed transitions:
--   CLOSED    → OPEN      (GESTOR opens voting for an item)
--   OPEN      → CONCLUDED (GESTOR closes voting for an item)
--   CONCLUDED → (terminal — votes are permanently locked)
-- Attempting to reopen a concluded vote is an integrity violation.
-- Fires BEFORE INSERT OR UPDATE OF voting_status.
CREATE OR REPLACE FUNCTION public.check_agenda_item_voting_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.voting_status <> 'CLOSED' THEN
            RAISE EXCEPTION
                'Agenda item initial voting_status must be CLOSED, got %', NEW.voting_status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.voting_status = NEW.voting_status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.voting_status = 'CLOSED' AND NEW.voting_status = 'OPEN')
        OR (OLD.voting_status = 'OPEN'   AND NEW.voting_status = 'CONCLUDED')
    ) THEN
        RAISE EXCEPTION
            'Invalid agenda item voting_status transition: % → % (item id: %)',
            OLD.voting_status, NEW.voting_status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- guard_vote_immutable: votes are the permanent record of democratic deliberation.
-- Once cast, no column — including vote_choice or weighted_permilagem — may be
-- changed. This trigger fires BEFORE UPDATE and always aborts.
-- The RLS deliberately provides no UPDATE policy; this trigger is defence-in-depth
-- against service-role misuse and direct SQL access.
CREATE OR REPLACE FUNCTION public.guard_vote_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION
        'Votes are immutable — updating a cast vote is not permitted (vote id: %)', OLD.id
        USING ERRCODE = 'check_violation';
END;
$$;

-- check_vote_open_state: defence-in-depth guard ensuring a vote can only be
-- inserted when the parent assembly is IN_PROGRESS and the agenda item is OPEN.
-- The castVote() server action (Phase 5.2) performs the same checks at the
-- application layer; this trigger prevents bypasses via direct SQL or edge cases
-- where the service-role client skips app-layer validation.
-- Fires BEFORE INSERT on votes.
CREATE OR REPLACE FUNCTION public.check_vote_open_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_assembly_status  public.assembly_status_enum;
    v_voting_status    public.agenda_item_voting_status_enum;
    v_voting_enabled   BOOL;
BEGIN
    SELECT a.status, ai.voting_status, ai.voting_enabled
      INTO v_assembly_status, v_voting_status, v_voting_enabled
      FROM public.agenda_items ai
      JOIN public.assemblies a ON a.id = ai.assembly_id
     WHERE ai.id = NEW.agenda_item_id;

    IF v_assembly_status IS NULL THEN
        RAISE EXCEPTION
            'Agenda item % not found', NEW.agenda_item_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT v_voting_enabled THEN
        RAISE EXCEPTION
            'Agenda item % does not have voting enabled', NEW.agenda_item_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_assembly_status <> 'IN_PROGRESS' THEN
        RAISE EXCEPTION
            'Cannot cast vote: assembly must be IN_PROGRESS, current status is % (agenda item: %)',
            v_assembly_status, NEW.agenda_item_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_voting_status <> 'OPEN' THEN
        RAISE EXCEPTION
            'Cannot cast vote: voting for agenda item % is %, must be OPEN',
            NEW.agenda_item_id, v_voting_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- =============================================================
-- TABLES
-- =============================================================

-- assemblies: one row per general meeting (Assembleia Geral) of a building.
-- quorum_required is a decimal percentage (e.g. 50.01 = 50.01% of total
-- permilagem). NUMERIC(5,2) can represent 0.01 – 100.00 with two decimal places,
-- matching the precision required by Portuguese condominium law (e.g. "maioria
-- qualificada de dois terços" = 66.67%).
-- location is optional; virtual-only meetings have no physical address.
-- scheduled_at records the planned start; the actual start is implicit in the
-- status transition timestamp written by Phase 5.2.
CREATE TABLE public.assemblies (
    id               UUID                        NOT NULL DEFAULT gen_random_uuid(),
    building_id      UUID                        NOT NULL,
    type             public.assembly_type_enum   NOT NULL,
    status           public.assembly_status_enum NOT NULL DEFAULT 'DRAFT',
    scheduled_at     TIMESTAMPTZ                 NOT NULL,
    quorum_required  NUMERIC(5,2)                NOT NULL DEFAULT 50.01,
    location         TEXT,
    created_by       UUID                        NOT NULL,
    created_at       TIMESTAMPTZ                 NOT NULL DEFAULT now(),

    CONSTRAINT assemblies_pkey              PRIMARY KEY (id),
    CONSTRAINT assemblies_quorum_range      CHECK (quorum_required > 0 AND quorum_required <= 100),
    CONSTRAINT assemblies_building_id_fkey  FOREIGN KEY (building_id)
        REFERENCES public.buildings (id) ON DELETE CASCADE,
    -- RESTRICT: deleting a GESTOR profile must not erase assembly authorship.
    -- GDPR erasure (Phase 9.1) anonymises the profile row instead of hard-deleting.
    CONSTRAINT assemblies_created_by_fkey   FOREIGN KEY (created_by)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);

-- agenda_items: ordered list of topics to discuss and (optionally) vote on.
-- order_index determines display order within an assembly.
-- The UNIQUE constraint is DEFERRABLE INITIALLY DEFERRED so that
-- reorderAgendaItems (Phase 5.2) can swap multiple order_index values within a
-- single transaction without hitting intermediate unique-key violations.
-- voting_enabled = false means the item is informational only (no vote buttons).
-- voting_status tracks whether voting is currently open, independent of voting_enabled —
-- both must be true for castVote() to succeed (also enforced by the trigger).
CREATE TABLE public.agenda_items (
    id              UUID                                  NOT NULL DEFAULT gen_random_uuid(),
    assembly_id     UUID                                  NOT NULL,
    order_index     INT                                   NOT NULL,
    title           VARCHAR(300)                          NOT NULL,
    description     TEXT,
    voting_enabled  BOOL                                  NOT NULL DEFAULT false,
    voting_status   public.agenda_item_voting_status_enum NOT NULL DEFAULT 'CLOSED',
    created_at      TIMESTAMPTZ                           NOT NULL DEFAULT now(),

    CONSTRAINT agenda_items_pkey                  PRIMARY KEY (id),
    CONSTRAINT agenda_items_order_index_positive  CHECK (order_index >= 0),
    -- DEFERRABLE allows atomic multi-row reordering in a single transaction.
    CONSTRAINT agenda_items_assembly_order_unique UNIQUE (assembly_id, order_index)
        DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT agenda_items_assembly_id_fkey      FOREIGN KEY (assembly_id)
        REFERENCES public.assemblies (id) ON DELETE CASCADE
);

-- votes: the permanent, immutable record of each unit's democratic choice.
-- UNIQUE on (agenda_item_id, unit_id) enforces one vote per unit per item.
-- voter_user_id records the authenticated user who physically cast the vote —
-- this may be the unit owner OR the proxy holder (see vote_proxies).
-- weighted_permilagem is a snapshot of the unit's permilagem at cast time.
-- This snapshot ensures that retroactive permilagem changes cannot alter
-- historical vote tallies, which is essential for legal audit integrity.
-- All columns are immutable after INSERT (guard_vote_immutable trigger).
CREATE TABLE public.votes (
    id                   UUID                    NOT NULL DEFAULT gen_random_uuid(),
    agenda_item_id       UUID                    NOT NULL,
    unit_id              UUID                    NOT NULL,
    voter_user_id        UUID                    NOT NULL,
    vote                 public.vote_choice_enum NOT NULL,
    weighted_permilagem  INT                     NOT NULL,
    cast_at              TIMESTAMPTZ             NOT NULL DEFAULT now(),

    CONSTRAINT votes_pkey                       PRIMARY KEY (id),
    CONSTRAINT votes_weighted_permilagem_range  CHECK (weighted_permilagem > 0 AND weighted_permilagem <= 10000),
    -- One vote per unit per item — prevents double-voting regardless of proxy chain.
    CONSTRAINT votes_agenda_item_unit_unique    UNIQUE (agenda_item_id, unit_id),
    CONSTRAINT votes_agenda_item_id_fkey        FOREIGN KEY (agenda_item_id)
        REFERENCES public.agenda_items (id) ON DELETE CASCADE,
    -- RESTRICT: unit archival must not silently erase vote history.
    CONSTRAINT votes_unit_id_fkey               FOREIGN KEY (unit_id)
        REFERENCES public.units (id) ON DELETE RESTRICT,
    -- RESTRICT: profile deletion must not erase who cast a vote (legal audit trail).
    CONSTRAINT votes_voter_user_id_fkey         FOREIGN KEY (voter_user_id)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);

-- vote_proxies: records delegated voting authority from one unit to another
-- for a specific assembly. A Condómino who cannot attend may delegate their
-- unit's vote to another unit's owner.
-- UNIQUE on (assembly_id, grantor_unit_id): a unit can grant at most one proxy
-- per assembly — vote delegation cannot be split across multiple recipients.
-- The proxy must be granted before the assembly transitions to IN_PROGRESS;
-- this timing constraint is enforced by the grantProxy() server action (Phase 5.2).
-- grantor_unit_id ≠ proxy_unit_id: self-proxy is structurally meaningless.
CREATE TABLE public.vote_proxies (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    assembly_id      UUID        NOT NULL,
    grantor_unit_id  UUID        NOT NULL,
    proxy_unit_id    UUID        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT vote_proxies_pkey                    PRIMARY KEY (id),
    CONSTRAINT vote_proxies_different_units         CHECK (grantor_unit_id <> proxy_unit_id),
    CONSTRAINT vote_proxies_assembly_grantor_unique UNIQUE (assembly_id, grantor_unit_id),
    CONSTRAINT vote_proxies_assembly_id_fkey        FOREIGN KEY (assembly_id)
        REFERENCES public.assemblies (id) ON DELETE CASCADE,
    -- RESTRICT: unit deactivation must not silently orphan proxy delegation records.
    CONSTRAINT vote_proxies_grantor_unit_id_fkey    FOREIGN KEY (grantor_unit_id)
        REFERENCES public.units (id) ON DELETE RESTRICT,
    CONSTRAINT vote_proxies_proxy_unit_id_fkey      FOREIGN KEY (proxy_unit_id)
        REFERENCES public.units (id) ON DELETE RESTRICT
);

-- atas: the formal meeting minutes for each assembly (exactly one per assembly).
-- content is rich-text HTML produced by the Tiptap editor (Phase 5.3).
-- UNIQUE on assembly_id enforces the one-ata-per-assembly invariant at DB level.
-- finalized_at and finalized_by are set atomically when status transitions to
-- FINALIZED by finalizeAta() (Phase 5.2). The pair must always be set or
-- cleared together (atas_finalization_pair_consistency); when FINALIZED, both
-- must be non-NULL (atas_finalization_status_consistency).
CREATE TABLE public.atas (
    id            UUID                   NOT NULL DEFAULT gen_random_uuid(),
    assembly_id   UUID                   NOT NULL,
    content       TEXT                   NOT NULL DEFAULT '',
    status        public.ata_status_enum NOT NULL DEFAULT 'DRAFT',
    finalized_at  TIMESTAMPTZ,
    finalized_by  UUID,
    created_at    TIMESTAMPTZ            NOT NULL DEFAULT now(),

    CONSTRAINT atas_pkey                              PRIMARY KEY (id),
    -- One ata per assembly enforced at DB level.
    CONSTRAINT atas_assembly_id_unique                UNIQUE (assembly_id),
    -- finalized_by and finalized_at must always be set or cleared together.
    CONSTRAINT atas_finalization_pair_consistency     CHECK (
        (finalized_by IS NULL AND finalized_at IS NULL)
        OR (finalized_by IS NOT NULL AND finalized_at IS NOT NULL)
    ),
    -- When FINALIZED the finalization pair must be populated; in DRAFT it must be NULL.
    CONSTRAINT atas_finalization_status_consistency   CHECK (
        (status = 'FINALIZED' AND finalized_by IS NOT NULL AND finalized_at IS NOT NULL)
        OR status = 'DRAFT'
    ),
    CONSTRAINT atas_assembly_id_fkey  FOREIGN KEY (assembly_id)
        REFERENCES public.assemblies (id) ON DELETE CASCADE,
    -- RESTRICT: profile deletion must not erase who finalised the ata (legal audit).
    CONSTRAINT atas_finalized_by_fkey FOREIGN KEY (finalized_by)
        REFERENCES public.profiles (id) ON DELETE RESTRICT
);


-- =============================================================
-- TRIGGERS
-- =============================================================

CREATE TRIGGER check_assembly_status_transition_trigger
    BEFORE INSERT OR UPDATE OF status
    ON public.assemblies
    FOR EACH ROW
    EXECUTE FUNCTION public.check_assembly_status_transition();

CREATE TRIGGER check_agenda_item_voting_status_transition_trigger
    BEFORE INSERT OR UPDATE OF voting_status
    ON public.agenda_items
    FOR EACH ROW
    EXECUTE FUNCTION public.check_agenda_item_voting_status_transition();

-- Fires BEFORE UPDATE — always raises an exception, aborting the update.
-- No BEFORE DELETE trigger is added: votes can only be deleted via CASCADE when
-- an assembly is hard-deleted (a SuperAdmin operation on building deletion), which
-- is the only legitimate path for removing vote records.
CREATE TRIGGER guard_vote_immutable_trigger
    BEFORE UPDATE ON public.votes
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_vote_immutable();

CREATE TRIGGER check_vote_open_state_trigger
    BEFORE INSERT ON public.votes
    FOR EACH ROW
    EXECUTE FUNCTION public.check_vote_open_state();


-- =============================================================
-- INDEXES (FK join optimisation + query patterns)
-- =============================================================

-- assemblies
CREATE INDEX idx_assemblies_building_id
    ON public.assemblies (building_id);

-- Primary filter for Phase 5.3 assembly list page: building × status.
CREATE INDEX idx_assemblies_building_status
    ON public.assemblies (building_id, status);

-- Scheduling/calendar view: most recent first within a building.
CREATE INDEX idx_assemblies_building_scheduled_at
    ON public.assemblies (building_id, scheduled_at DESC);

-- agenda_items
CREATE INDEX idx_agenda_items_assembly_id
    ON public.agenda_items (assembly_id);

-- Phase 5.3 agenda tab: items ordered within an assembly.
CREATE INDEX idx_agenda_items_assembly_order
    ON public.agenda_items (assembly_id, order_index);

-- GESTOR quick-find: items with voting currently open.
CREATE INDEX idx_agenda_items_voting_open
    ON public.agenda_items (assembly_id)
    WHERE voting_status = 'OPEN';

-- votes
CREATE INDEX idx_votes_agenda_item_id
    ON public.votes (agenda_item_id);

-- Phase 5.3 VoteTallyBar: aggregate vote choices per agenda item.
CREATE INDEX idx_votes_agenda_item_tally
    ON public.votes (agenda_item_id, vote);

-- Per-unit vote history / "has this unit already voted?" check.
CREATE INDEX idx_votes_unit_id
    ON public.votes (unit_id);

CREATE INDEX idx_votes_voter_user_id
    ON public.votes (voter_user_id);

-- vote_proxies
CREATE INDEX idx_vote_proxies_assembly_id
    ON public.vote_proxies (assembly_id);

-- castVote (Phase 5.2) proxy lookup: has the voter's unit been granted a proxy?
CREATE INDEX idx_vote_proxies_proxy_unit
    ON public.vote_proxies (assembly_id, proxy_unit_id);

-- atas
-- assembly_id already covered by the atas_assembly_id_unique constraint index.
-- Partial index for GESTOR dashboard: atas still awaiting finalisation.
CREATE INDEX idx_atas_draft
    ON public.atas (status)
    WHERE status = 'DRAFT';


-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.assemblies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vote_proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atas         ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- assemblies policies
-- Policy naming convention: {table}_{role}_{action}
-- -------------------------------------------------------------

-- GESTOR has unrestricted access to assemblies for buildings they manage.
CREATE POLICY assemblies_gestor_all
    ON public.assemblies
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.assemblies.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.assemblies.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'GESTOR'
        )
    );

-- Condóminos may view PUBLISHED, IN_PROGRESS, CONCLUDED, and ARCHIVED assemblies.
-- DRAFT assemblies are hidden until the GESTOR publishes and notifies owners.
CREATE POLICY assemblies_condomino_select
    ON public.assemblies
    FOR SELECT
    USING (
        status IN ('PUBLISHED', 'IN_PROGRESS', 'CONCLUDED', 'ARCHIVED')
        AND EXISTS (
            SELECT 1
            FROM public.user_building_roles ubr
            WHERE ubr.building_id = public.assemblies.building_id
              AND ubr.user_id     = auth.uid()
              AND ubr.role        = 'CONDÓMINO'
        )
    );


-- -------------------------------------------------------------
-- agenda_items policies
-- -------------------------------------------------------------

-- GESTOR has unrestricted access to agenda items for their buildings.
-- The JOIN through assemblies is required because agenda_items has no direct
-- building_id column — multi-hop FK isolation is the correct pattern here.
CREATE POLICY agenda_items_gestor_all
    ON public.agenda_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.assemblies a
            JOIN public.user_building_roles ubr ON ubr.building_id = a.building_id
            WHERE a.id        = public.agenda_items.assembly_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.assemblies a
            JOIN public.user_building_roles ubr ON ubr.building_id = a.building_id
            WHERE a.id        = public.agenda_items.assembly_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- Condóminos may read agenda items for visible assemblies.
-- The assembly status filter is re-applied here so that Condóminos cannot
-- enumerate DRAFT assembly items by querying agenda_items directly.
CREATE POLICY agenda_items_condomino_select
    ON public.agenda_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.assemblies a
            JOIN public.user_building_roles ubr ON ubr.building_id = a.building_id
            WHERE a.id        = public.agenda_items.assembly_id
              AND a.status    IN ('PUBLISHED', 'IN_PROGRESS', 'CONCLUDED', 'ARCHIVED')
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'CONDÓMINO'
        )
    );


-- -------------------------------------------------------------
-- votes policies
-- -------------------------------------------------------------

-- GESTOR can view all votes in their buildings for tally computation and legal audit.
CREATE POLICY votes_gestor_select
    ON public.votes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.agenda_items ai
            JOIN public.assemblies a         ON a.id  = ai.assembly_id
            JOIN public.user_building_roles ubr ON ubr.building_id = a.building_id
            WHERE ai.id       = public.votes.agenda_item_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- Condóminos can view all votes for assemblies in their building.
-- This intentional openness enables the live VoteTallyBar (Phase 5.3),
-- which displays aggregate weighted results per agenda item. Individual voter
-- identity exposure can be mitigated at the UI layer without restricting DB access.
CREATE POLICY votes_condomino_select
    ON public.votes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.agenda_items ai
            JOIN public.assemblies a         ON a.id  = ai.assembly_id
            JOIN public.user_building_roles ubr ON ubr.building_id = a.building_id
            WHERE ai.id       = public.votes.agenda_item_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'CONDÓMINO'
        )
    );

-- Condóminos (and proxy holders) may INSERT their own votes.
-- Detailed validation — assembly IN_PROGRESS, item OPEN, active unit ownership,
-- proxy chain verification — is performed by castVote() (Phase 5.2) running under
-- the service role. This policy's role is strictly tenant isolation:
--   1. voter_user_id must equal auth.uid() — prevents vote spoofing.
--   2. The target unit must belong to a building where auth.uid() is a member —
--      prevents cross-tenant vote injection.
-- Per-unit ownership and proxy verification are app-layer responsibilities.
CREATE POLICY votes_condomino_insert
    ON public.votes
    FOR INSERT
    WITH CHECK (
        voter_user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.units u
            JOIN public.user_building_roles ubr ON ubr.building_id = u.building_id
            WHERE u.id        = public.votes.unit_id
              AND ubr.user_id = auth.uid()
        )
    );


-- -------------------------------------------------------------
-- vote_proxies policies
-- -------------------------------------------------------------

-- GESTOR can view all proxy grants for assemblies in their buildings.
CREATE POLICY vote_proxies_gestor_select
    ON public.vote_proxies
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.assemblies a
            JOIN public.user_building_roles ubr ON ubr.building_id = a.building_id
            WHERE a.id        = public.vote_proxies.assembly_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- Condóminos can view proxy grants for assemblies in their building.
-- Proxy transparency is required so all owners can verify delegation records
-- before and during the assembly session.
CREATE POLICY vote_proxies_condomino_select
    ON public.vote_proxies
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.assemblies a
            JOIN public.user_building_roles ubr ON ubr.building_id = a.building_id
            WHERE a.id        = public.vote_proxies.assembly_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'CONDÓMINO'
        )
    );

-- Condóminos may grant a proxy for a unit they actively own.
-- The assembly-not-yet-started guard (status < IN_PROGRESS) and same-building
-- unit membership validation are delegated to grantProxy() (Phase 5.2).
-- This policy enforces the minimum tenant-isolation invariant: the grantor unit
-- must have an active ownership row for auth.uid() at the time of INSERT.
CREATE POLICY vote_proxies_condomino_insert
    ON public.vote_proxies
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.unit_ownership uo
            JOIN public.assemblies a ON a.id = public.vote_proxies.assembly_id
            JOIN public.units u
              ON u.id = uo.unit_id
             AND u.building_id = a.building_id
            WHERE uo.unit_id       = public.vote_proxies.grantor_unit_id
              AND uo.owner_user_id = auth.uid()
              AND uo.ended_at      IS NULL
        )
    );

-- Condóminos may revoke a proxy they previously granted (before IN_PROGRESS).
-- The timing guard is enforced at the app layer by grantProxy/revokeProxy actions.
CREATE POLICY vote_proxies_condomino_delete
    ON public.vote_proxies
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.unit_ownership uo
            WHERE uo.unit_id       = public.vote_proxies.grantor_unit_id
              AND uo.owner_user_id = auth.uid()
              AND uo.ended_at      IS NULL
        )
    );


-- -------------------------------------------------------------
-- atas policies
-- -------------------------------------------------------------

-- GESTOR has full access to atas for their buildings (create, edit, finalise).
CREATE POLICY atas_gestor_all
    ON public.atas
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.assemblies a
            JOIN public.user_building_roles ubr ON ubr.building_id = a.building_id
            WHERE a.id        = public.atas.assembly_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.assemblies a
            JOIN public.user_building_roles ubr ON ubr.building_id = a.building_id
            WHERE a.id        = public.atas.assembly_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'GESTOR'
        )
    );

-- Condóminos may read FINALIZED atas for assemblies in their building.
-- DRAFT atas are hidden until the GESTOR formally publishes via finalizeAta().
CREATE POLICY atas_condomino_select_finalized
    ON public.atas
    FOR SELECT
    USING (
        status = 'FINALIZED'
        AND EXISTS (
            SELECT 1
            FROM public.assemblies a
            JOIN public.user_building_roles ubr ON ubr.building_id = a.building_id
            WHERE a.id        = public.atas.assembly_id
              AND ubr.user_id = auth.uid()
              AND ubr.role    = 'CONDÓMINO'
        )
    );
