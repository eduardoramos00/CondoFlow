/**
 * Client-safe permission matrix.
 *
 * No server-only imports — this module is used from both Server Components /
 * server actions AND Client Components (e.g. <TransitionButton>, which must
 * hide controls the user cannot act on).
 *
 * Roles
 * -----
 * SUPERADMIN — platform-level; stored in auth.users.app_metadata.role.
 *              Bypasses all building-scoped checks (handled in can() below).
 * GESTOR     — building manager; row in user_building_roles.
 * CONDÓMINO  — resident / fraction owner; row in user_building_roles.
 *
 * Usage
 * -----
 *   // Server action (role already resolved via requireRole):
 *   // import { UnauthorizedError } from '@/lib/auth/roles'; // server-only
 *   if (!can('approve_budget', role)) throw new UnauthorizedError();
 *
 *   // Client component (role from context):
 *   {can('cast_vote', role) && <VoteButton />}
 */

// ---------------------------------------------------------------------------
// Role types
// ---------------------------------------------------------------------------

export type BuildingRole = 'GESTOR' | 'CONDÓMINO';
export type AppRole = 'SUPERADMIN' | BuildingRole;

// ---------------------------------------------------------------------------
// Action catalogue
// Exhaustive union of every operation protected by RBAC across all phases.
// When adding a new server action, add its action string here first.
// ---------------------------------------------------------------------------

export type Action =
  // --- Budget management (Phase 2.4) ---
  | 'create_budget'
  | 'approve_budget'
  | 'add_budget_line_item'
  | 'view_budget'

  // --- Quota management (Phase 2.5) ---
  | 'generate_quotas'
  | 'mark_quota_paid'
  | 'mark_quota_overdue'
  | 'waive_quota'
  | 'view_all_quotas'       // GESTOR: all units in building
  | 'view_own_quotas'       // CONDÓMINO: own unit only

  // --- Expenses (Phase 3.3) ---
  | 'create_expense'
  | 'approve_expense'
  | 'upload_invoice'
  | 'view_all_expenses'     // GESTOR: all statuses
  | 'view_approved_expenses' // CONDÓMINO: APPROVED + RECONCILED only

  // --- Suppliers (Phase 3.4) ---
  | 'create_supplier'
  | 'update_supplier'
  | 'deactivate_supplier'
  | 'view_suppliers'

  // --- Assemblies (Phase 5.2) ---
  | 'create_assembly'
  | 'update_assembly'
  | 'transition_assembly_status'
  | 'manage_agenda_items'   // add / reorder
  | 'open_voting'
  | 'close_voting'
  | 'cast_vote'             // unit-ownership enforced in the server action
  | 'grant_proxy'
  | 'finalize_ata'
  | 'view_assembly'
  | 'export_ata'

  // --- Incidents (Phase 6.2) ---
  | 'report_incident'
  | 'assess_incident'
  | 'dispatch_supplier_to_incident'
  | 'transition_incident_status'
  | 'upload_incident_attachment'
  | 'view_incidents'

  // --- Buildings & Units (Phase 1.1 / 1.2) ---
  | 'manage_building_settings'
  | 'manage_units'
  | 'view_building'
  | 'view_units'

  // --- Notifications (Phase 4.3 / 9.3) ---
  | 'update_notification_preferences'

  // --- SuperAdmin (Phase 8.2) ---
  | 'list_all_buildings'
  | 'list_all_users'
  | 'assign_gestor_to_building'
  | 'revoke_gestor'
  | 'suspend_user'

  // --- GDPR (Phase 9.1) ---
  | 'request_data_deletion'
  | 'process_data_deletion';

// ---------------------------------------------------------------------------
// Permission sets
// ---------------------------------------------------------------------------

const GESTOR_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  // Budgets
  'create_budget',
  'approve_budget',
  'add_budget_line_item',
  'view_budget',
  // Quotas
  'generate_quotas',
  'mark_quota_paid',
  'mark_quota_overdue',
  'waive_quota',
  'view_all_quotas',
  // Expenses
  'create_expense',
  'approve_expense',
  'upload_invoice',
  'view_all_expenses',
  // Suppliers
  'create_supplier',
  'update_supplier',
  'deactivate_supplier',
  'view_suppliers',
  // Assemblies
  'create_assembly',
  'update_assembly',
  'transition_assembly_status',
  'manage_agenda_items',
  'open_voting',
  'close_voting',
  'cast_vote',            // GESTOR may also own a unit; unit check is in the action
  'finalize_ata',
  'view_assembly',
  'export_ata',
  // Incidents
  'assess_incident',
  'dispatch_supplier_to_incident',
  'transition_incident_status',
  'upload_incident_attachment',
  'view_incidents',
  // Buildings & Units
  'manage_building_settings',
  'manage_units',
  'view_building',
  'view_units',
  // Notifications
  'update_notification_preferences',
  // GDPR
  'request_data_deletion',
]);

const CONDOMINO_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  // Budgets — residents are legally entitled to view the budget (DL 268/94)
  'view_budget',
  // Quotas — own unit only
  'view_own_quotas',
  // Expenses — approved records only
  'view_approved_expenses',
  // Assemblies
  'cast_vote',
  'grant_proxy',
  'view_assembly',
  'export_ata',
  // Incidents
  'report_incident',
  'upload_incident_attachment',
  'view_incidents',
  // Buildings & Units
  'view_building',
  'view_units',
  // Notifications
  'update_notification_preferences',
  // GDPR
  'request_data_deletion',
]);

// Keyed by BuildingRole only; SUPERADMIN is handled as a special case in can().
const PERMISSIONS: Readonly<Record<BuildingRole, ReadonlySet<Action>>> = {
  GESTOR: GESTOR_ACTIONS,
  CONDÓMINO: CONDOMINO_ACTIONS,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the given role is permitted to perform the given action.
 *
 * SUPERADMIN always returns true — platform admins are not subject to
 * building-level permission restrictions.
 */
export function can(action: Action, role: AppRole): boolean {
  if (role === 'SUPERADMIN') return true;
  return PERMISSIONS[role].has(action);
}
