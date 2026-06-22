import "server-only";

import { formatCurrency } from "@/lib/utils/currency";
import type { EmailTemplate, EmailTemplatePayload } from "./email";

// ---------------------------------------------------------------------------
// Local email template rendering
//
// The Resend send API does not support dashboard-managed templates — every
// request must carry its own subject + html/text. Each template is therefore
// rendered here, typed against EmailTemplatePayload so trigger payloads and
// template variables cannot drift apart. The Postmark adapter keeps using
// provider-side template aliases and does not go through this module.
// ---------------------------------------------------------------------------

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "long",
    timeZone: "Europe/Lisbon",
  }).format(new Date(isoDate));
}

function formatDateTime(isoDateTime: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(new Date(isoDateTime));
}

// Wraps the body paragraphs in the shared CondoFlow layout. Paragraphs are
// received already-escaped; this function only adds chrome.
function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt">
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background-color:#1e3a5f;color:#ffffff;padding:16px 24px;border-radius:8px 8px 0 0;">
      <strong style="font-size:18px;">CondoFlow</strong>
    </div>
    <div style="background-color:#ffffff;padding:24px;border-radius:0 0 8px 8px;color:#27272a;font-size:15px;line-height:1.6;">
      <h1 style="font-size:18px;margin:0 0 16px;">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="color:#71717a;font-size:12px;text-align:center;margin-top:16px;">
      Está a receber este email porque tem notificações activadas no CondoFlow.
      Pode alterar as suas preferências na página de definições de notificações.
    </p>
  </div>
</body>
</html>`;
}

const renderers: {
  [T in EmailTemplate]: (payload: EmailTemplatePayload[T]) => RenderedEmail;
} = {
  QUOTA_OVERDUE: (p) => {
    const amount = formatCurrency(p.amount_cents);
    const due = formatDate(p.due_date);
    const title = "Quota em atraso";
    return {
      subject: `Quota em atraso — ${p.building_name}`,
      html: layout(
        title,
        `<p>A quota da fracção <strong>${escapeHtml(p.unit_identifier)}</strong> do edifício <strong>${escapeHtml(p.building_name)}</strong>, no valor de <strong>${escapeHtml(amount)}</strong> e com vencimento a ${escapeHtml(due)}, encontra-se em atraso.</p>
         <p>Por favor regularize o pagamento por transferência bancária. Se já efectuou o pagamento, aguarde a confirmação do gestor.</p>`,
      ),
      text:
        `Quota em atraso\n\n` +
        `A quota da fracção ${p.unit_identifier} do edifício ${p.building_name}, no valor de ${amount} e com vencimento a ${due}, encontra-se em atraso.\n\n` +
        `Por favor regularize o pagamento por transferência bancária. Se já efectuou o pagamento, aguarde a confirmação do gestor.`,
    };
  },

  QUOTA_REMINDER: (p) => {
    const amount = formatCurrency(p.amount_cents);
    const due = formatDate(p.due_date);
    const title = "Lembrete de quota";
    return {
      subject: `Lembrete de quota — ${p.building_name}`,
      html: layout(
        title,
        `<p>A quota da fracção <strong>${escapeHtml(p.unit_identifier)}</strong> do edifício <strong>${escapeHtml(p.building_name)}</strong>, no valor de <strong>${escapeHtml(amount)}</strong>, vence a <strong>${escapeHtml(due)}</strong>.</p>
         <p>O pagamento é efectuado por transferência bancária para a conta do condomínio.</p>`,
      ),
      text:
        `Lembrete de quota\n\n` +
        `A quota da fracção ${p.unit_identifier} do edifício ${p.building_name}, no valor de ${amount}, vence a ${due}.\n\n` +
        `O pagamento é efectuado por transferência bancária para a conta do condomínio.`,
    };
  },

  ASSEMBLY_SCHEDULED: (p) => {
    const when = formatDateTime(p.scheduled_at);
    const title = `Assembleia ${p.assembly_type.toLowerCase()} convocada`;
    return {
      subject: `Assembleia ${p.assembly_type.toLowerCase()} convocada — ${p.building_name}`,
      html: layout(
        title,
        `<p>Foi convocada uma assembleia <strong>${escapeHtml(p.assembly_type.toLowerCase())}</strong> do edifício <strong>${escapeHtml(p.building_name)}</strong>.</p>
         <p><strong>Data:</strong> ${escapeHtml(when)}<br/>
         <strong>Local:</strong> ${escapeHtml(p.location)}</p>
         <p>Consulte a ordem do dia na plataforma.</p>`,
      ),
      text:
        `Assembleia ${p.assembly_type.toLowerCase()} convocada\n\n` +
        `Foi convocada uma assembleia ${p.assembly_type.toLowerCase()} do edifício ${p.building_name}.\n\n` +
        `Data: ${when}\nLocal: ${p.location}\n\n` +
        `Consulte a ordem do dia na plataforma.`,
    };
  },

  ASSEMBLY_REMINDER_48H: (p) => {
    const when = formatDateTime(p.scheduled_at);
    const title = "Assembleia dentro de 48 horas";
    return {
      subject: `Lembrete: assembleia dentro de 48 horas — ${p.building_name}`,
      html: layout(
        title,
        `<p>A assembleia <strong>${escapeHtml(p.assembly_type.toLowerCase())}</strong> do edifício <strong>${escapeHtml(p.building_name)}</strong> realiza-se dentro de 48 horas.</p>
         <p><strong>Data:</strong> ${escapeHtml(when)}<br/>
         <strong>Local:</strong> ${escapeHtml(p.location)}</p>`,
      ),
      text:
        `Assembleia dentro de 48 horas\n\n` +
        `A assembleia ${p.assembly_type.toLowerCase()} do edifício ${p.building_name} realiza-se dentro de 48 horas.\n\n` +
        `Data: ${when}\nLocal: ${p.location}`,
    };
  },

  VOTE_OPEN: (p) => {
    const title = "Votação aberta";
    return {
      subject: `Votação aberta: ${p.agenda_item_title} — ${p.building_name}`,
      html: layout(
        title,
        `<p>Está aberta a votação do ponto <strong>${escapeHtml(p.agenda_item_title)}</strong> na assembleia ${escapeHtml(p.assembly_type.toLowerCase())} do edifício <strong>${escapeHtml(p.building_name)}</strong>.</p>
         <p>Aceda à plataforma para registar o seu voto.</p>`,
      ),
      text:
        `Votação aberta\n\n` +
        `Está aberta a votação do ponto "${p.agenda_item_title}" na assembleia ${p.assembly_type.toLowerCase()} do edifício ${p.building_name}.\n\n` +
        `Aceda à plataforma para registar o seu voto.`,
    };
  },

  INCIDENT_RESOLVED: (p) => {
    const when = formatDateTime(p.resolved_at);
    const title = "Incidente resolvido";
    return {
      subject: `Incidente resolvido: ${p.incident_title} — ${p.building_name}`,
      html: layout(
        title,
        `<p>O incidente <strong>${escapeHtml(p.incident_title)}</strong> no edifício <strong>${escapeHtml(p.building_name)}</strong> foi marcado como resolvido a ${escapeHtml(when)}.</p>`,
      ),
      text:
        `Incidente resolvido\n\n` +
        `O incidente "${p.incident_title}" no edifício ${p.building_name} foi marcado como resolvido a ${when}.`,
    };
  },

  WELCOME: (p) => {
    const title = "Bem-vindo ao CondoFlow";
    return {
      subject: `Bem-vindo ao CondoFlow — ${p.building_name}`,
      html: layout(
        title,
        `<p>Foi adicionado como condómino do edifício <strong>${escapeHtml(p.building_name)}</strong> no CondoFlow.</p>
         <p>Utilize o botão abaixo para aceder à sua conta:</p>
         <p style="text-align:center;margin:24px 0;">
           <a href="${escapeHtml(p.magic_link)}" style="background-color:#1e3a5f;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Aceder à minha conta</a>
         </p>
         <p>Se o botão não funcionar, copie e cole este endereço no navegador:<br/>${escapeHtml(p.magic_link)}</p>`,
      ),
      text:
        `Bem-vindo ao CondoFlow\n\n` +
        `Foi adicionado como condómino do edifício ${p.building_name} no CondoFlow.\n\n` +
        `Aceda à sua conta através deste endereço:\n${p.magic_link}`,
    };
  },
};

export function renderEmailTemplate(
  template: EmailTemplate,
  payload: Record<string, unknown>,
): RenderedEmail {
  const render = renderers[template] as (
    p: Record<string, unknown>,
  ) => RenderedEmail;
  return render(payload);
}
