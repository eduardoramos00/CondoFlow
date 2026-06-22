import "server-only";

import { ResendAdapter } from "./providers/resend";
import { PostmarkAdapter } from "./providers/postmark";

// ---------------------------------------------------------------------------
// EmailTemplate
//
// Mirrors the notification_event_enum values defined in migration 005 for the
// subset of events that trigger outbound emails. IN_APP-only events (e.g.
// future system alerts) are handled by the NotificationContext (Phase 4.4)
// and do not need an EmailTemplate entry.
// ---------------------------------------------------------------------------

export const EmailTemplate = {
  QUOTA_OVERDUE:         "QUOTA_OVERDUE",
  QUOTA_REMINDER:        "QUOTA_REMINDER",
  ASSEMBLY_SCHEDULED:    "ASSEMBLY_SCHEDULED",
  ASSEMBLY_REMINDER_48H: "ASSEMBLY_REMINDER_48H",
  VOTE_OPEN:             "VOTE_OPEN",
  INCIDENT_RESOLVED:     "INCIDENT_RESOLVED",
  WELCOME:               "WELCOME",
} as const;

export type EmailTemplate = (typeof EmailTemplate)[keyof typeof EmailTemplate];

// ---------------------------------------------------------------------------
// EmailTemplatePayload
//
// Maps each template to the exact payload shape the provider adapter must
// receive. Phase 4.3 trigger functions call sendEmail<T>() with the matching
// payload type — TypeScript enforces field completeness at the call site.
// ---------------------------------------------------------------------------

export type EmailTemplatePayload = {
  QUOTA_OVERDUE: {
    unit_identifier: string;
    amount_cents: number;
    due_date: string;
    building_name: string;
  };
  QUOTA_REMINDER: {
    unit_identifier: string;
    amount_cents: number;
    due_date: string;
    building_name: string;
  };
  ASSEMBLY_SCHEDULED: {
    assembly_type: "ORDINÁRIA" | "EXTRAORDINÁRIA";
    scheduled_at: string;
    location: string;
    building_name: string;
  };
  ASSEMBLY_REMINDER_48H: {
    assembly_type: "ORDINÁRIA" | "EXTRAORDINÁRIA";
    scheduled_at: string;
    location: string;
    building_name: string;
  };
  VOTE_OPEN: {
    agenda_item_title: string;
    assembly_type: "ORDINÁRIA" | "EXTRAORDINÁRIA";
    building_name: string;
  };
  INCIDENT_RESOLVED: {
    incident_title: string;
    building_name: string;
    resolved_at: string;
  };
  WELCOME: {
    building_name: string;
    magic_link: string;
  };
};

// ---------------------------------------------------------------------------
// EmailAdapter
//
// Implemented by ResendAdapter and PostmarkAdapter. The adapter receives the
// template identifier, recipient address, and the serialised payload — it is
// responsible for mapping the template to its provider-specific template ID /
// alias and calling the provider's REST API.
// ---------------------------------------------------------------------------

export interface EmailAdapter {
  send(
    template: EmailTemplate,
    to: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// sendEmail
//
// Public entry point. Reads EMAIL_PROVIDER from the environment, selects the
// matching adapter, and forwards the call. Throws if EMAIL_PROVIDER is missing
// or set to an unsupported value so misconfiguration surfaces at call time.
// ---------------------------------------------------------------------------

function getAdapter(provider: string): EmailAdapter {
  if (provider === "resend")   return new ResendAdapter();
  if (provider === "postmark") return new PostmarkAdapter();
  throw new Error(
    `Unsupported EMAIL_PROVIDER "${provider}". Valid values: "resend", "postmark".`,
  );
}

export async function sendEmail<T extends EmailTemplate>(
  template: T,
  recipient: string,
  payload: EmailTemplatePayload[T],
): Promise<void> {
  const provider = process.env["EMAIL_PROVIDER"] ?? "resend";
  const adapter  = getAdapter(provider);
  await adapter.send(template, recipient, payload as Record<string, unknown>);
}
