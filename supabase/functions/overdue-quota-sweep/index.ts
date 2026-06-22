import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Scheduled daily sweep — marks PENDING quotas OVERDUE and notifies owners.
//
// Invocation: Supabase pg_cron at 07:00 UTC daily (configured via the
// Supabase dashboard or [functions."overdue-quota-sweep"] in config.toml).
// Auth: caller must pass Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>.
// Grace period: quotas whose due_date is more than OVERDUE_GRACE_PERIOD_DAYS
// days in the past are eligible (default: 5 days).
// ---------------------------------------------------------------------------

// Template IDs for each email provider — mirrors src/lib/notifications/providers/*.
// Update these after creating the corresponding templates in each dashboard.
const RESEND_TEMPLATE_IDS: Record<string, string> = {
  QUOTA_OVERDUE: "tmpl_quota_overdue",
};

const POSTMARK_TEMPLATE_ALIASES: Record<string, string> = {
  QUOTA_OVERDUE: "quota-overdue",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuotaRow {
  id: string;
  unit_id: string;
  amount_cents: number;
  due_date: string;
  units: {
    identifier: string;
    building_id: string;
    buildings: { name: string };
  };
}

interface OwnerRow    { owner_user_id: string }
interface MemberRow   { user_id: string }
interface PrefsRow    { email_enabled: boolean; sms_enabled: boolean; push_enabled: boolean }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Calls the active email provider's REST API directly (Deno cannot import the
// Node-only adapters in src/lib/notifications/providers/).
async function sendEmailForQuotaOverdue(
  to: string,
  payload: Record<string, unknown>,
  provider: string,
  resendKey: string,
  postmarkKey: string,
  from: string,
): Promise<void> {
  if (provider === "resend") {
    const templateId = RESEND_TEMPLATE_IDS["QUOTA_OVERDUE"]!;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], template_id: templateId, variables: payload }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return;
  }

  if (provider === "postmark") {
    const alias = POSTMARK_TEMPLATE_ALIASES["QUOTA_OVERDUE"]!;
    const res = await fetch("https://api.postmarkapp.com/email/withTemplate", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": postmarkKey,
      },
      body: JSON.stringify({
        From:          from,
        To:            to,
        TemplateAlias: alias,
        TemplateModel: payload,
        MessageStream: "outbound",
      }),
    });
    if (!res.ok) throw new Error(`Postmark ${res.status}: ${await res.text()}`);
    return;
  }

  throw new Error(`Unsupported EMAIL_PROVIDER "${provider}"`);
}

// ---------------------------------------------------------------------------
// notifyOwners — inserts IN_APP + EMAIL notifications for all active unit
// owners of the given quota, respecting their notification_preferences.
// ---------------------------------------------------------------------------

async function notifyOwners(
  admin: ReturnType<typeof createClient>,
  quota: QuotaRow,
  emailConfig: { provider: string; resendKey: string; postmarkKey: string; from: string },
): Promise<void> {
  const buildingId     = quota.units.building_id;
  const buildingName   = quota.units.buildings.name;
  const unitIdentifier = quota.units.identifier;
  const now            = new Date().toISOString();

  // Find active unit owners.
  const { data: ownerRows } = await admin
    .from("unit_ownership")
    .select("owner_user_id")
    .eq("unit_id", quota.unit_id)
    .is("ended_at", null);

  for (const ownerRow of (ownerRows ?? []) as OwnerRow[]) {
    const ownerId = ownerRow.owner_user_id;

    // Fetch user email via Auth Admin API.
    const { data: authData } = await admin.auth.admin.getUserById(ownerId);
    const email = authData?.user?.email ?? null;

    // Check notification preferences (default: all enabled).
    const { data: prefsData } = await admin
      .from("notification_preferences")
      .select("email_enabled, sms_enabled, push_enabled")
      .eq("user_id", ownerId)
      .eq("building_id", buildingId)
      .maybeSingle();

    const prefs: PrefsRow = prefsData
      ? (prefsData as unknown as PrefsRow)
      : { email_enabled: true, sms_enabled: true, push_enabled: true };

    const notifPayload = {
      unit_identifier: unitIdentifier,
      amount_cents:    quota.amount_cents,
      due_date:        quota.due_date,
      building_name:   buildingName,
    };

    // IN_APP — always delivered (service role bypasses RLS INSERT restriction).
    await admin.from("notifications").insert({
      building_id:       buildingId,
      recipient_user_id: ownerId,
      event_type:        "QUOTA_OVERDUE",
      channel:           "IN_APP",
      payload:           notifPayload,
      delivery_status:   "SENT",
      sent_at:           now,
    });

    // EMAIL — only if enabled and address is available.
    if (!prefs.email_enabled || !email) continue;

    const { data: emailNotif } = await admin
      .from("notifications")
      .insert({
        building_id:       buildingId,
        recipient_user_id: ownerId,
        event_type:        "QUOTA_OVERDUE",
        channel:           "EMAIL",
        payload:           notifPayload,
        delivery_status:   "PENDING",
      })
      .select("id")
      .single();

    if (!emailNotif) continue;

    const notifId = (emailNotif as unknown as { id: string }).id;
    const sentAt  = new Date().toISOString();

    try {
      await sendEmailForQuotaOverdue(
        email, notifPayload,
        emailConfig.provider, emailConfig.resendKey, emailConfig.postmarkKey, emailConfig.from,
      );
      await admin
        .from("notifications")
        .update({ delivery_status: "SENT", sent_at: sentAt })
        .eq("id", notifId);
    } catch {
      await admin
        .from("notifications")
        .update({ delivery_status: "FAILED" })
        .eq("id", notifId);
    }
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl  = Deno.env.get("SUPABASE_URL");
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  // Verify caller identity — the Supabase scheduler passes the service role key.
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${serviceKey}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Compute the cutoff date: quotas with due_date <= cutoffDate are eligible.
  const graceDays  = parseInt(Deno.env.get("OVERDUE_GRACE_PERIOD_DAYS") ?? "5", 10);
  const cutoff     = new Date();
  cutoff.setDate(cutoff.getDate() - graceDays);
  const cutoffDate = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  // Email provider config — read once and passed to notifyOwners.
  const emailConfig = {
    provider:   Deno.env.get("EMAIL_PROVIDER") ?? "resend",
    resendKey:  Deno.env.get("RESEND_API_KEY")  ?? "",
    postmarkKey: Deno.env.get("POSTMARK_API_KEY") ?? "",
    from:       Deno.env.get("EMAIL_FROM") ?? "CondoFlow <noreply@condoflow.pt>",
  };

  // Fetch all PENDING quotas past the grace-period cutoff.
  const { data: quotas, error: fetchError } = await admin
    .from("quotas")
    .select(
      "id, unit_id, amount_cents, due_date, units!inner(identifier, building_id, buildings!inner(name))",
    )
    .eq("status", "PENDING")
    .lte("due_date", cutoffDate);

  if (fetchError) {
    return jsonResponse({ error: "Failed to query quotas", detail: fetchError.message }, 500);
  }

  let processed = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const quotaRow of (quotas ?? [])) {
    const quota = quotaRow as unknown as QuotaRow;

    // Atomically transition PENDING → OVERDUE.
    // The second .eq("status", "PENDING") acts as an optimistic lock: if another
    // process (or a GESTOR action) already changed the status, this update matches
    // zero rows and we skip without error, preventing duplicate notifications.
    const { data: updated } = await admin
      .from("quotas")
      .update({ status: "OVERDUE" })
      .eq("id", quota.id)
      .eq("status", "PENDING")
      .select("id");

    if (!updated || updated.length === 0) {
      skipped++;
      continue;
    }

    try {
      await notifyOwners(admin, quota, emailConfig);
      processed++;
    } catch {
      failed++;
    }
  }

  return jsonResponse({ success: true, processed, skipped, failed, cutoff_date: cutoffDate }, 200);
});
