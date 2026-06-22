# CondoFlow — Engineering Roadmap

> Maintained by the Architect. Executed by the Developer. Orchestrated by the Supervisor.
> Status legend: `[ ]` = pending · `[~]` = in progress · `[x]` = done · `[!]` = blocked

---

## PHASE 0 — Project Foundations & Tooling

### 0.1 — Repository & Framework Bootstrap ✅
- [x] Initialise Next.js 14+ project with App Router (`src/` layout, TypeScript strict mode, ESLint + Prettier)
- [x] Configure `tsconfig.json` with strict: `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`
- [x] Set up Tailwind CSS v4 with `darkMode: 'class'` and custom theme tokens (zinc palette, indigo accent) via CSS-first `@theme`
- [x] Add Inter font via `next/font/google`; wire as `--font-inter` / `font-sans` default in root layout
- [x] Install and configure `shadcn/ui` (v4, Tailwind v4 compatible, dark mode wired)
- [x] Install core dependencies: `lucide-react`, `recharts`, `react-hook-form`, `zod`, `@tiptap/react`, `react-dropzone`, `yet-another-react-lightbox`, `@supabase/supabase-js`, `@supabase/ssr`, `decimal.js`, `next-themes`
- [x] Configure absolute import paths in `tsconfig.json` (`@/` → `src/`)
- [x] Set up `.env.local.example` template with all required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `POSTMARK_API_KEY`

### 0.2 — Supabase Project Setup ✅
- [x] Create Supabase project; enable Supabase Auth (email+password, magic link) — credentials set in `.env.local`
- [x] Create Supabase Storage buckets: `invoices` and `incident-media` (private, 10 MB limit) — provisioned in `supabase/seed.sql` with RLS policies
- [x] Initialise `supabase/` folder with local dev config (`supabase/config.toml`)
- [x] Create `src/lib/supabase/server.ts` — exports `createServerSessionClient()` (cookie-aware, anon key) and `createServerSupabaseClient()` (service role, bypasses RLS)
- [x] Create `src/lib/supabase/client.ts` — exports `createBrowserSupabaseClient()` (anon key, Realtime only)
- [x] Create `src/lib/auth/session.ts` — exports `getServerSession()`, `getServerUser()`, `getServerUserId()`
- [x] Create `src/middleware.ts` — Supabase session-refresh middleware (JWT rotation on every request); route protection extended in Phase 1.3

### 0.3 — App Shell & Route Groups ✅
- [x] Create route groups: `src/app/(auth)/`, `src/app/(dashboard)/`, `src/app/(marketing)/`
- [x] Build root `layout.tsx`: `bg-zinc-950` dark base, Inter font, `<Providers>` wrapper; `title.template` for per-page titles
- [x] Create `src/app/(auth)/layout.tsx`: centered zinc-900 card, CondoFlow brand mark, max-w-sm form area
- [x] Create `src/app/(dashboard)/layout.tsx`: full-height flex shell with `<Sidebar>` + `<TopNav>` + scrollable `<main>`
- [x] Create `src/app/(marketing)/layout.tsx`: minimal full-height zinc-950 wrapper
- [x] Create `src/components/layout/Sidebar.tsx`: three nav groups (Geral/Financeiro/Condomínio), building selector, active-route highlighting, user email + sign-out footer
- [x] Create `src/components/layout/TopNav.tsx`: page title, search button, live notification bell (unread badge from NotificationContext), avatar button
- [x] Create `src/components/layout/Providers.tsx`: composes UserProvider → NotificationProvider for the root layout
- [x] Create `src/contexts/UserContext.tsx`: Supabase Auth `onAuthStateChange` listener; exposes `user`, `isLoading`, `useUser()`
- [x] Create `src/contexts/NotificationContext.tsx`: Realtime INSERT subscription scoped to `recipient_user_id`; exposes `notifications`, `unreadCount`, `markAsRead()`, `useNotifications()`

---

## PHASE 1 — Auth, RBAC & Multi-Tenant Core

### 1.1 — Database: Core Schema (Migration 001)
- [x] Write migration `001_core_schema.sql`:
  - `profiles` table (extends `auth.users`: `id`, `full_name`, `avatar_url`, `created_at`) — tag `full_name` with `-- PII`
  - `buildings` table (`id`, `name`, `address`, `fiscal_number`, `created_at`, `owner_gestor_id FK profiles`)
  - `user_building_roles` table (`user_id FK profiles`, `building_id FK buildings`, `role ENUM('GESTOR','CONDÓMINO')`, `created_at`) — composite PK on `(user_id, building_id)`
  - Enable RLS on all three tables
  - Write RLS policies: `profiles_self_select`, `buildings_gestor_select`, `buildings_condómino_select_own`, `user_building_roles_self_select`

### 1.2 — Database: Unit & Ownership Schema (Migration 002)
- [x] Write migration `002_units_schema.sql`:
  - `units` table (`id`, `building_id FK`, `identifier VARCHAR` e.g. "2ºC", `floor INT`, `permilagem INT CHECK > 0`, `created_at`)
  - `unit_ownership` table (`id`, `unit_id FK`, `owner_user_id FK profiles`, `started_at DATE`, `ended_at DATE NULLABLE`) — tracks historical ownership
  - DB trigger: validate that sum of `permilagem` within a `building_id` does not exceed `10000` on INSERT/UPDATE
  - Enable RLS; write policies: `units_gestor_all`, `units_condómino_select_own`

### 1.3 — Auth UI & Server Actions
- [x] Build `/login` page: email + password form, `react-hook-form` + zod schema, calls Supabase Auth sign-in
- [x] Build `/register` page: name, email, password; creates `profiles` record on sign-up via Supabase Auth trigger
- [x] Build `/forgot-password` and `/reset-password` pages
- [x] Create `src/app/actions/auth.ts`: `signIn()`, `signOut()`, `signUp()` server actions — each starts with session guard pattern
- [x] Implement middleware (`src/middleware.ts`): redirect unauthenticated users from `(dashboard)` routes to `/login`
- [x] Implement role-based redirect on login: SuperAdmin → `/admin`, Gestor → `/dashboard`, Condómino → `/my-building`

### 1.4 — RBAC Utilities
- [x] Create `src/lib/auth/roles.ts`: exports `getUserRole(userId, buildingId)`, `requireRole(session, buildingId, role[])` — throws if unauthorized
- [x] Create `src/lib/auth/can.ts`: permission matrix mapping role → allowed actions (e.g. `can('approve_expense', role)`)
- [x] Add SuperAdmin detection: role stored in `auth.users.app_metadata.role = 'SUPERADMIN'`

### 1.5 — Dashboard Shell Components
- [x] Build `<Sidebar>` component: building selector dropdown at top, nav links grouped by role (financial, buildings, incidents, assemblies, settings); icons from `lucide-react`
- [x] Build `<TopNav>` component: breadcrumb, `<Bell />` notification icon with unread badge, user avatar dropdown (profile, sign out)
- [x] Build `<StatusBadge status={string} />` at `src/components/ui/StatusBadge.tsx` — maps all platform status enums to color-coded pill badges
- [x] Build skeleton loader utility component `<SkeletonCard />` using `animate-pulse bg-zinc-800 rounded-md` pattern

---

## PHASE 2 — Financial Ledger (Permilagem, Budgets & Quotas)

### 2.1 — Database: Financial Schema (Migration 003)
- [x] Write migration `003_financial_schema.sql`:
  - `budgets` table (`id`, `building_id FK`, `fiscal_year INT`, `total_amount_cents INT`, `reserve_amount_cents INT`, `status ENUM('DRAFT','APPROVED')`, `created_by FK profiles`)
  - `budget_line_items` table (`id`, `budget_id FK`, `category budget_category_enum`, `amount_cents INT`, `description TEXT`)
  - `quotas` table (`id`, `unit_id FK`, `budget_id FK`, `due_date DATE`, `amount_cents INT`, `reserve_cents INT`, `status ENUM('PENDING','PAID','OVERDUE','WAIVED')`, `paid_at TIMESTAMPTZ NULLABLE`)
  - `payments` table (`id`, `quota_id FK`, `amount_cents INT`, `paid_by FK profiles`, `payment_method VARCHAR`, `reference VARCHAR`, `created_at`)
  - `audit_log` table (`id`, `actor_user_id FK profiles`, `action VARCHAR`, `target_table VARCHAR`, `target_id UUID`, `before_snapshot JSONB`, `after_snapshot JSONB`, `occurred_at TIMESTAMPTZ DEFAULT now()`) — **NO UPDATE/DELETE RLS — append-only**
  - Enable RLS on all tables; write all policies per naming convention

### 2.2 — Permilagem Calculation Engine
- [x] Create `src/lib/finance/permilagem.ts`:
  - `calculateUnitQuota(totalBudgetCents: number, unitPermilagem: number): number` — pure function, no side effects
  - `calculateReserve(totalBudgetCents: number, unitPermilagem: number): number`
  - `formatPermilagem(value: number): string` — formats `850` → `"8,50‰"`
  - `validateBuildingPermilagem(units: {permilagem: number}[]): boolean` — returns true only if sum equals 10000
- [x] Write unit tests for all four functions in `src/lib/finance/permilagem.test.ts`

### 2.3 — Currency Utility
- [x] Create `src/lib/utils/currency.ts`:
  - `formatCurrency(cents: number, locale?: string, currency?: string): string` — defaults to `pt-PT` / `EUR`, returns e.g. `"1 234,56 €"`
  - `centsToDecimal(cents: number): number` — for display only, never for arithmetic
  - `decimalToCents(value: number): number` — for form input conversion only

### 2.4 — Budget Server Actions & UI ✅
- [x] Create `src/app/actions/budgets.ts`: `createBudget()`, `approveBudget()`, `addLineItem()` — each calls `requireRole(..., ['GESTOR'])` and writes to `audit_log`
- [x] Build `/dashboard/financials/budget` page: annual budget creation form, line items table, approve button, reserve fund % warning if below 10%
- [x] Build `<BudgetSummaryCard>` component: displays total budget, approved line items, reserve amount with compliance status badge
- [x] Add DB trigger or server-side check: warn if `reserve_amount_cents < total_amount_cents * 0.10` on budget approval

### 2.5 — Quota Generation & Management ✅
- [x] Create `src/app/actions/quotas.ts`: `generateMonthlyQuotas(buildingId, budgetId, month, year)` — iterates all active units, calls `calculateUnitQuota`, bulk-inserts quota records; writes to `audit_log`
- [x] Create `src/app/actions/quotas.ts`: `markQuotaPaid(quotaId, paymentData)`, `markQuotaOverdue(quotaId)`, `waiveQuota(quotaId, reason)`
- [x] Build `/dashboard/financials/quotas` page: data table of all units × quotas for selected month, filter by status, bulk-mark-paid action
- [x] Build `<QuotaStatusChart>` at `src/components/charts/QuotaStatusChart.tsx`: `<PieChart>` donut (Recharts), `innerRadius={60}`, segments: PAID/OVERDUE/PENDING using design system colors
- [x] Build Condómino view `/my-building/payments`: own unit's quota history table with payment status badges and amount breakdown (quota + reserve)

---

## PHASE 3 — Expense Ingestion & Supplier Management

### 3.1 — Database: Expense Schema (Migration 004)
- [x] Write migration `004_expenses_schema.sql`:
  - `suppliers` table (`id`, `building_id FK`, `name VARCHAR -- PII`, `nif VARCHAR -- PII`, `contact_email VARCHAR -- PII`, `service_type VARCHAR`, `is_active BOOL DEFAULT true`, `created_at`)
  - `documents` table (`id`, `building_id FK`, `storage_path VARCHAR`, `mime_type VARCHAR`, `file_size_bytes INT`, `status ENUM('PROCESSING','DRAFT','LINKED')`, `ocr_payload JSONB NULLABLE`, `uploaded_by FK profiles`, `created_at`)
  - `expenses` table (`id`, `building_id FK`, `document_id FK NULLABLE`, `supplier_id FK`, `category expense_category_enum`, `amount_cents INT`, `expense_date DATE`, `description TEXT`, `status ENUM('DRAFT','AWAITING_APPROVAL','APPROVED','RECONCILED')`, `approved_by FK profiles NULLABLE`, `approved_at TIMESTAMPTZ NULLABLE`)
  - Enable RLS; write policies for GESTOR (full access) and CONDÓMINO (read-only on APPROVED+RECONCILED)

### 3.2 — File Upload Server Action
- [x] Create `src/app/actions/documents.ts`: `uploadInvoice(buildingId, formData)` — validates MIME + size (max 10MB) server-side; uploads to `invoices/{building_id}/{year}/{month}/{uuid}.{ext}`; creates `document` record with `status: 'PROCESSING'`; triggers Edge Function (stubbed); returns `document.id`
- [x] Create Supabase Edge Function stub `supabase/functions/process-invoice/index.ts`: receives `document_id`, updates record to `DRAFT` with mock OCR payload (prepare interface for real OCR integration)

### 3.3 — Expense UI
- [x] Build `src/components/expenses/InvoiceDropzone.tsx`: `react-dropzone` zone accepting PDF/image, previews thumbnail or filename chip; calls `uploadInvoice` server action on drop
- [x] Build `/dashboard/expenses/new` page: form with `InvoiceDropzone`, supplier selector (async combobox), category enum dropdown, amount field (decimal input → converted to cents), date picker
- [x] Build `/dashboard/expenses` page: data table of all building expenses, filterable by category/status/date range, total sum footer row
- [x] Build expense approval flow: `AWAITING_APPROVAL` rows show an "Approve" action button (visible to GESTOR only); calls `approveExpense()` server action; writes to `audit_log`

### 3.4 — Supplier Management
- [x] Create `src/app/actions/suppliers.ts`: `createSupplier()`, `updateSupplier()`, `deactivateSupplier()` — GESTOR-only
- [x] Build `/dashboard/suppliers` page: table of all building suppliers with service type, active status toggle, and inline edit drawer (shadcn/ui Sheet)

---

## PHASE 4 — Automated Multi-Channel Notification System

### 4.1 — Database: Notification Schema (Migration 005)
- [x] Write migration `005_notifications_schema.sql`:
  - `notifications` table (`id`, `building_id FK`, `recipient_user_id FK profiles`, `event_type notification_event_enum`, `channel notification_channel_enum`, `payload JSONB`, `sent_at TIMESTAMPTZ NULLABLE`, `delivery_status ENUM('PENDING','SENT','FAILED','READ')`, `created_at`)
  - `notification_preferences` table (`user_id FK profiles`, `building_id FK buildings`, `email_enabled BOOL DEFAULT true`, `sms_enabled BOOL DEFAULT true`, `push_enabled BOOL DEFAULT true`) — composite PK
  - Enable RLS: users can only SELECT/UPDATE their own preferences; only service role can INSERT into notifications

### 4.2 — Email Notification Service
- [x] Create `src/lib/notifications/email.ts`: exports `sendEmail(template: EmailTemplate, recipient: string, payload: Record<string, unknown>): Promise<void>` — reads `EMAIL_PROVIDER` env var; routes to Resend or Postmark adapters
- [x] Create `src/lib/notifications/providers/resend.ts`: Resend adapter implementing the interface
- [x] Create `src/lib/notifications/providers/postmark.ts`: Postmark adapter implementing the interface
- [x] Define `EmailTemplate` enum: `QUOTA_OVERDUE`, `QUOTA_REMINDER`, `ASSEMBLY_SCHEDULED`, `ASSEMBLY_REMINDER_48H`, `VOTE_OPEN`, `INCIDENT_RESOLVED` with corresponding template IDs

### 4.3 — Notification Triggers (Server Actions)
- [x] Create `src/lib/notifications/triggers.ts`: one function per event type — `notifyQuotaOverdue(quotaId)`, `notifyAssemblyScheduled(assemblyId)`, `notifyIncidentReported(incidentId)` etc. — each respects `notification_preferences`
- [x] Wire `notifyQuotaOverdue` into the `markQuotaOverdue` server action (Phase 2.5)
- [x] Create Supabase Edge Function `supabase/functions/overdue-quota-sweep/index.ts`: scheduled daily, queries quotas past due date + grace period, calls `markQuotaOverdue` for each — configure cron schedule in `supabase/functions/` config

### 4.4 — In-App Notification UI
- [x] Implement `NotificationProvider` at `src/contexts/NotificationContext.tsx`: subscribes to `notifications` table via Supabase Realtime on mount (filtered by `recipient_user_id = auth.uid()`); exposes `{ notifications, unreadCount, markAsRead }`
- [x] Wire provider into `src/app/(dashboard)/layout.tsx`
- [x] Update `<TopNav>`: connect `<Bell />` icon to `unreadCount`; build `<NotificationDropdown>` panel listing recent notifications with event icons and relative timestamps

---

## PHASE 5 — Assembly & Digital Voting Hub

### 5.1 — Database: Assembly Schema (Migration 006)
- [x] Write migration `006_assemblies_schema.sql`:
  - `assemblies` table (`id`, `building_id FK`, `type ENUM('ORDINÁRIA','EXTRAORDINÁRIA')`, `status ENUM('DRAFT','PUBLISHED','IN_PROGRESS','CONCLUDED','ARCHIVED')`, `scheduled_at TIMESTAMPTZ`, `quorum_required NUMERIC(5,2) DEFAULT 50.01`, `location TEXT`, `created_by FK profiles`, `created_at`)
  - `agenda_items` table (`id`, `assembly_id FK`, `order_index INT`, `title VARCHAR`, `description TEXT`, `voting_enabled BOOL DEFAULT false`, `voting_status ENUM('CLOSED','OPEN','CONCLUDED') DEFAULT 'CLOSED'`)
  - `votes` table (`id`, `agenda_item_id FK`, `unit_id FK`, `voter_user_id FK profiles`, `vote ENUM('FAVOR','AGAINST','ABSTAIN')`, `weighted_permilagem INT`, `cast_at TIMESTAMPTZ DEFAULT now()`) — UNIQUE on `(agenda_item_id, unit_id)`
  - `vote_proxies` table (`id`, `assembly_id FK`, `grantor_unit_id FK`, `proxy_unit_id FK`, `created_at`) — UNIQUE on `(assembly_id, grantor_unit_id)`
  - `atas` table (`id`, `assembly_id FK UNIQUE`, `content TEXT`, `status ENUM('DRAFT','FINALIZED')`, `finalized_at TIMESTAMPTZ NULLABLE`, `finalized_by FK profiles NULLABLE`)
  - Enable RLS on all tables; Condóminos can SELECT published/concluded assemblies and INSERT own votes only

### 5.2 — Assembly Server Actions
- [x] Create `src/app/actions/assemblies.ts`:
  - `createAssembly()`, `updateAssembly()`, `transitionAssemblyStatus(id, targetStatus)` — GESTOR-only
  - `addAgendaItem()`, `reorderAgendaItems()`, `openVoting(agendaItemId)`, `closeVoting(agendaItemId)` — GESTOR-only
  - `castVote(agendaItemId, vote)` — validates: unit owner in building, assembly `IN_PROGRESS`, item `OPEN`, not already voted; records `weighted_permilagem` snapshot; immutable
  - `grantProxy(assemblyId, proxyUnitId)` — only before assembly `IN_PROGRESS`
  - `finalizeAta(assemblyId)` — GESTOR-only; sets `ata.status = 'FINALIZED'`; triggers `ASSEMBLY_SCHEDULED` notification to all owners

### 5.3 — Assembly UI
- [x] Build `/dashboard/assemblies` page: list of all assemblies with type, scheduled date, status badge, quick action buttons
- [x] Build `/dashboard/assemblies/new` page: assembly creation form (type, date, location, quorum %)
- [x] Build `/dashboard/assemblies/[id]` page with three tabs (shadcn/ui `<Tabs>`):
  - **Agenda tab:** ordered list of agenda items; GESTOR controls to add/reorder items and open/close voting per item
  - **Votação tab:** per agenda item, show live tally bar (FAVOR/AGAINST/ABSTAIN weighted by permilagem); Condómino vote buttons (FAVOR/AGAINST/ABSTAIN); hidden until assembly `IN_PROGRESS`
  - **Ata tab:** `@tiptap/react` rich-text editor (GESTOR); read-only rendered view (Condómino after `CONCLUDED`); "Finalize & Publish" button; PDF export button
- [x] Build `<VoteTallyBar>` component: three-segment Tailwind progress bar with percentage labels; props: `favor`, `against`, `abstain` as permilagem integers

### 5.4 — Ata PDF Export
- [x] Create `/api/assemblies/[id]/ata/export/route.ts`: fetches ata content + assembly metadata; renders to PDF using `@react-pdf/renderer`; sets `Content-Disposition: attachment` header
- [x] Design ata PDF template: formal Portuguese header (building name, fiscal number, assembly type, date), agenda items, vote results, `ata` body text, GESTOR signature line

---

## PHASE 6 — Incident & Ticket Tracking

### 6.1 — Database: Incident Schema (Migration 007)
- [x] Write migration `007_incidents_schema.sql`:
  - `incidents` table (`id`, `building_id FK`, `unit_id FK`, `reported_by FK profiles`, `title VARCHAR`, `description TEXT`, `status ENUM('REPORTED','ASSESSED','SUPPLIER_DISPATCHED','IN_PROGRESS','RESOLVED','CLOSED')`, `priority ENUM('LOW','MEDIUM','HIGH','CRITICAL') NULLABLE`, `created_at`, `updated_at`)
  - `incident_attachments` table (`id`, `incident_id FK`, `storage_path VARCHAR`, `mime_type VARCHAR`, `uploaded_by FK profiles`, `created_at`) — max 5 per incident enforced via CHECK constraint or trigger
  - `incident_history` table (`id`, `incident_id FK`, `actor_user_id FK profiles`, `from_status incident_status_enum`, `to_status incident_status_enum`, `comment TEXT NULLABLE`, `transitioned_at TIMESTAMPTZ DEFAULT now()`) — append-only
  - `supplier_dispatches` table (`id`, `incident_id FK`, `supplier_id FK`, `scheduled_date DATE`, `quoted_cost_cents INT NULLABLE`, `notes TEXT NULLABLE`, `created_at`)
  - Enable RLS: Condóminos can INSERT incidents for own unit, SELECT all building incidents; GESTOR can UPDATE status and priority

### 6.2 — Incident Server Actions
- [x] Create `src/app/actions/incidents.ts`:
  - `reportIncident(buildingId, unitId, title, description)` — any authenticated Condómino; triggers `INCIDENT_REPORTED` notification; writes to `incident_history`
  - `assessIncident(incidentId, priority)` — GESTOR-only; sets priority; writes history
  - `dispatchSupplier(incidentId, supplierId, scheduledDate, quotedCost)` — GESTOR-only; creates `supplier_dispatches` record; advances status to `SUPPLIER_DISPATCHED`; writes history
  - `transitionIncident(incidentId, targetStatus, comment?)` — validates legal next-status per kanban order; writes history; triggers `INCIDENT_RESOLVED` notification on RESOLVED; for CRITICAL priority, triggers mass notification on REPORTED
  - `uploadIncidentAttachment(incidentId, formData)` — validates max 5 attachments; uploads to `incident-media/{building_id}/{incident_id}/{uuid}.{ext}`; creates `incident_attachments` record

### 6.3 — Incident Kanban Board UI
- [x] Build `/dashboard/incidents` page: horizontal kanban board — flex row of 6 status columns, `overflow-x: auto`, each column `min-w-[280px]`
- [x] Build `<IncidentCard>` component: title, unit identifier, `<StatusBadge>` for priority, relative creation date, `<Paperclip />` attachment count; full card is a link to the detail page
- [x] Build `<TransitionButton>` at `src/components/incidents/TransitionButton.tsx`: renders only if current user role permits the next status transition; calls `transitionIncident` server action on click; optimistic UI update
- [x] Build `/dashboard/incidents/[id]` detail page: full incident info, `<TransitionButton>`, image gallery using `next/image`, lightbox via `yet-another-react-lightbox`, history timeline, supplier dispatch form (GESTOR only)
- [x] Build `/my-building/incidents` page: Condómino view — list of own building's incidents + "Report New Incident" button; form as a shadcn/ui Sheet drawer

---

## PHASE 7 — Analytics, Reporting & PDF Exports

### 7.1 — Financial Summary View ✅
- [x] Write migration `008_financial_views.sql`:
  - Create view `financial_summary`: per building per month — `income_cents` (SUM of PAID quotas), `expense_cents` (SUM of APPROVED + RECONCILED expenses), `reserve_balance_cents`, `outstanding_debt_cents` (SUM of OVERDUE quotas)
  - Enable RLS-compatible access: view uses `SECURITY INVOKER`; GESTOR can see own buildings

### 7.2 — Chart Components ✅
- [x] Build `src/components/charts/CashFlowChart.tsx`: `<AreaChart>` (Recharts), 12-month rolling data, `stroke="#6366f1"`, gradient fill `opacity 0.3→0`, `<ResponsiveContainer>`, custom tooltip using `formatCurrency`
- [x] Build `src/components/charts/QuotaStatusChart.tsx`: `<PieChart>` donut `innerRadius={60}`, PAID/OVERDUE/PENDING segments with design system colors, centre label showing total units
- [x] Build `src/components/charts/ExpenseByCategoryChart.tsx`: `<BarChart>` (Recharts) grouped by `expense_category_enum`, 6-month view, horizontal layout

### 7.3 — Dashboard Pages ✅
- [x] Build `/dashboard` (Gestor home): KPI cards row — Total Income MTD, Total Expenses MTD, Reserve Fund Balance, Open Incidents count; `<CashFlowChart>` below; `<QuotaStatusChart>` and `<ExpenseByCategoryChart>` in grid
- [x] Build `/my-building` (Condómino home): own quota history list, current balance card, building incident count, upcoming assembly card
- [x] All KPI cards use the base card pattern: `rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm`

### 7.4 — PDF Export Service ✅
- [x] Create `src/lib/pdf/` directory with `@react-pdf/renderer` templates:
  - `QuotaReceiptTemplate.tsx` — unit owner, building, month, amount breakdown (quota + reserve)
  - `AnnualBudgetReportTemplate.tsx` — building, fiscal year, all line items, total, reserve %
  - `ExpenseReportTemplate.tsx` — date range filter, expenses grouped by category, supplier, totals
- [x] Create `/api/documents/export/[type]/[id]/route.ts`: dispatches to the correct PDF template; streams response as `application/pdf`
- [x] Add download buttons on quota row (receipt), budget page (annual report), expense page (expense report)

---

## PHASE 8 — SuperAdmin Portal

### 8.1 — Database: SuperAdmin Schema (Migration 009)
- [x] Write migration `009_superadmin_schema.sql`:
  - `session_log` table (`id`, `superadmin_user_id FK profiles`, `impersonated_user_id FK profiles`, `building_id FK NULLABLE`, `action TEXT`, `occurred_at TIMESTAMPTZ DEFAULT now()`) — append-only audit for impersonation events
  - Confirm `auth.users.app_metadata.role = 'SUPERADMIN'` as the SuperAdmin gate (no DB table needed — managed via Supabase Auth admin API)

### 8.2 — SuperAdmin Server Actions & Middleware
- [x] Update `src/middleware.ts`: route `/admin/*` to require `app_metadata.role = 'SUPERADMIN'`; redirect others to `/dashboard`
- [x] Create `src/app/actions/admin.ts`: `listAllBuildings()`, `listAllUsers()`, `assignGestorToBuilding()`, `revokeGestor()`, `suspendUser()` — all require SuperAdmin check; write to `session_log`

### 8.3 — SuperAdmin UI
- [x] Build `/admin` portal layout: separate sidebar with admin nav items (Buildings, Users, Platform Stats, Settings)
- [x] Build `/admin/buildings` page: table of all buildings across platform — name, gestor name, unit count, open incidents, last quota run date; link to building detail
- [x] Build `/admin/users` page: table of all users — role, buildings, last login, status; suspend/activate toggle
- [x] Build `/admin/stats` page: platform KPI dashboard — total buildings, total units, platform MRR (total quotas generated), total outstanding debt, incident SLA compliance rate (% resolved within 7 days)

---

## PHASE 9 — GDPR, Hardening & Pre-Launch

### 9.1 — GDPR Compliance
- [x] Write migration `010_gdpr_schema.sql`:
  - `gdpr_deletion_requests` table (`id`, `requesting_user_id FK profiles`, `target_user_id FK profiles`, `status ENUM('PENDING','PROCESSING','COMPLETED')`, `requested_at`, `completed_at NULLABLE`)
- [x] Create `src/app/actions/gdpr.ts`: `requestDataDeletion()` — creates request record; `processDataDeletion(requestId)` — SuperAdmin-only; anonymises PII fields (`full_name → 'REDACTED'`, `email → uuid@deleted.condoflow`, phone/NIF nulled) without deleting financial audit records

### 9.2 — Performance & Security Hardening
- [x] Add `next/headers` CSP headers in `next.config.ts`: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- [x] Audit all server actions: confirm every one starts with `getServerSession()` guard
- [x] Audit all Supabase queries: confirm no anon-key client used for mutations
- [x] Add Zod validation to all API route handlers (validate incoming request body shape before processing)
- [x] Add rate limiting on auth routes (`/api/auth/*`) via Supabase's built-in or middleware header check

### 9.3 — Notification Preferences UI
- [x] Build `/dashboard/settings/notifications` page: per-channel toggles (email, SMS, push) per event type using data from `notification_preferences`; calls `updateNotificationPreferences()` server action on change

### 9.4 — Onboarding Flow
- [x] Build building creation wizard (3 steps: Building details → Add units with permilagem → Invite Condóminos via email)
- [x] Add permilagem validation step in wizard: live total counter showing current sum / 10000; block "Finish" if sum ≠ 10000
- [x] Send welcome email to invited Condóminos via `sendEmail('WELCOME', ...)` with magic link

### 9.5 — Final QA Checklist
- [x] Run `npx tsc --noEmit` — zero type errors
- [x] Confirm `any` is absent from all `src/` TypeScript files (`grep -r ': any' src/`)
- [x] Confirm all monetary calculations route through `calculateUnitQuota` or integer arithmetic only
- [x] Confirm all RLS policies exist for every table (run `SELECT tablename FROM pg_tables WHERE schemaname='public'` and cross-check)
- [x] Confirm all storage paths follow the defined conventions
- [x] Smoke test all PDF exports
- [x] Verify dark mode renders correctly on all pages
- [x] Confirm `lucide-react` is the only icon source in the codebase (`grep -r 'heroicons\|react-icons\|feather' src/`)

---

## Dependency Order Summary

```
Phase 0 (Foundations)
  └─► Phase 1 (Auth & RBAC)
        └─► Phase 2 (Financial Ledger)   ──► Phase 4 (Notifications)
        └─► Phase 3 (Expenses)           ──► Phase 4
        └─► Phase 5 (Assemblies)         ──► Phase 4
        └─► Phase 6 (Incidents)          ──► Phase 4
              └─► Phase 7 (Analytics)
              └─► Phase 8 (SuperAdmin)
                    └─► Phase 9 (Hardening & Launch)
```

> **Developer rule:** Always complete Phase 0 and Phase 1 before touching any other phase. Phases 2, 3, 5, and 6 can proceed in parallel once Phase 1 is done. Phase 7 requires Phases 2, 3, 5, and 6 to be functionally complete.
