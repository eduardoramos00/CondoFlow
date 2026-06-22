import "server-only";

import type { EmailAdapter, EmailTemplate } from "../email";

const POSTMARK_API_URL = "https://api.postmarkapp.com/email/withTemplate";

// Template aliases as created in the Postmark dashboard (Templates section).
// Aliases are case-insensitive in Postmark; lowercase kebab-case is used here
// for consistency. The alias must match exactly what is set in the dashboard.
const TEMPLATE_ALIASES: Record<EmailTemplate, string> = {
  QUOTA_OVERDUE:         "quota-overdue",
  QUOTA_REMINDER:        "quota-reminder",
  ASSEMBLY_SCHEDULED:    "assembly-scheduled",
  ASSEMBLY_REMINDER_48H: "assembly-reminder-48h",
  VOTE_OPEN:             "vote-open",
  INCIDENT_RESOLVED:     "incident-resolved",
  WELCOME:               "welcome",
};

export class PostmarkAdapter implements EmailAdapter {
  async send(
    template: EmailTemplate,
    to: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const apiKey = process.env["POSTMARK_API_KEY"];
    if (!apiKey) throw new Error("POSTMARK_API_KEY is not configured.");

    const from =
      process.env["EMAIL_FROM"] ??
      process.env["POSTMARK_FROM_EMAIL"] ??
      "noreply@condoflow.pt";

    const alias = TEMPLATE_ALIASES[template];

    const response = await fetch(POSTMARK_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": apiKey,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        TemplateAlias: alias,
        TemplateModel: payload,
        MessageStream: "outbound",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Postmark API error ${response.status} for template "${template}" (alias: "${alias}"): ${body}`,
      );
    }
  }
}
