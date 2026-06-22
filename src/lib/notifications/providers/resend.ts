import "server-only";

import type { EmailAdapter, EmailTemplate } from "../email";
import { renderEmailTemplate } from "../templates";

const RESEND_API_URL = "https://api.resend.com/emails";

// The Resend send API does not support dashboard-managed templates — each
// request must carry its own subject + html/text, so templates are rendered
// locally via renderEmailTemplate (see ../templates.ts).
export class ResendAdapter implements EmailAdapter {
  async send(
    template: EmailTemplate,
    to: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

    const from = process.env["EMAIL_FROM"] ?? "CondoFlow <noreply@condoflow.pt>";
    const { subject, html, text } = renderEmailTemplate(template, payload);

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Resend API error ${response.status} for template "${template}": ${body}`,
      );
    }
  }
}
