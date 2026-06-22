"use server";

import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/notifications/email";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const buildingSchema = z.object({
  name:         z.string().min(2, "Nome obrigatório.").max(200),
  address:      z.string().min(5, "Morada obrigatória.").max(500),
  fiscalNumber: z.string().min(5, "NIF/NIPC obrigatório.").max(20, "NIF/NIPC inválido."),
});

const unitSchema = z.object({
  identifier: z.string().min(1, "Identificador obrigatório.").max(30),
  floor:      z.number().int("Piso deve ser inteiro."),
  permilagem: z.number().int().min(1, "Permilagem mínima: 1.").max(10000),
});

const createBuildingInputSchema = z.object({
  building: buildingSchema,
  units: z
    .array(unitSchema)
    .min(1, "Adicione pelo menos uma fracção.")
    .refine(
      (units) => units.reduce((s, u) => s + u.permilagem, 0) === 10000,
      "A soma das permilagens deve ser exatamente 10 000.",
    ),
});

const inviteInputSchema = z.object({
  buildingId: z.string().uuid("buildingId inválido."),
  invites: z.array(
    z.object({
      email:  z.string().email("Email inválido."),
      unitId: z.string().uuid().optional(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreatedUnit = {
  id:          string;
  identifier:  string;
  floor:       number;
  permilagem:  number;
};

export type CreateBuildingResult =
  | { buildingId: string; createdUnits: CreatedUnit[] }
  | { error: string };

export type InviteResult = { sent: number; errors: string[] };

// ---------------------------------------------------------------------------
// createBuildingWithUnits
//
// Inserts a new building (which triggers handle_new_building → GESTOR role)
// then inserts each unit sequentially so the permilagem check trigger fires
// per-row and the serialization lock prevents concurrent over-allocation.
//
// On any unit insert failure the building is deleted (CASCADE removes partial
// units) and an error is returned — the wizard stays on step 2.
// ---------------------------------------------------------------------------

export async function createBuildingWithUnits(
  building: z.infer<typeof buildingSchema>,
  units:    z.infer<typeof unitSchema>[],
): Promise<CreateBuildingResult> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  const parsed = createBuildingInputSchema.safeParse({ building, units });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createServerSupabaseClient();

  // Create building — handle_new_building trigger inserts GESTOR role row.
  const { data: buildingRow, error: buildingError } = await admin
    .from("buildings")
    .insert({
      name:           building.name,
      address:        building.address,
      fiscal_number:  building.fiscalNumber,
      owner_gestor_id: session.user.id,
    })
    .select("id")
    .single();

  if (buildingError || !buildingRow) {
    if (buildingError?.message?.includes("buildings_fiscal_number_unique")) {
      return { error: "Já existe um edifício registado com este NIF/NIPC." };
    }
    return { error: "Erro ao criar edifício. Tente novamente." };
  }

  const buildingId = (buildingRow as { id: string }).id;
  const createdUnits: CreatedUnit[] = [];

  // Insert units one-by-one so the BEFORE trigger fires for each row,
  // enforcing the permilagem ≤ 10 000 invariant under concurrent writes.
  for (const unit of units) {
    const { data: unitRow, error: unitError } = await admin
      .from("units")
      .insert({
        building_id: buildingId,
        identifier:  unit.identifier,
        floor:       unit.floor,
        permilagem:  unit.permilagem,
      })
      .select("id, identifier, floor, permilagem")
      .single();

    if (unitError || !unitRow) {
      // Roll back by deleting the building; CASCADE removes any partial units.
      await admin.from("buildings").delete().eq("id", buildingId);
      return { error: `Erro ao criar fracção "${unit.identifier}". Verifique os dados e tente novamente.` };
    }

    createdUnits.push(unitRow as unknown as CreatedUnit);
  }

  return { buildingId, createdUnits };
}

// ---------------------------------------------------------------------------
// inviteCondominos
//
// For each email:
//   • New users  → generateLink (creates the auth user, no Supabase email
//     sent) → record ACCEPTED invitation + assign CONDÓMINO role directly →
//     send WELCOME email with magic link. The role cannot be left to the
//     handle_new_user trigger: generateLink inserts into auth.users before
//     the invitation row exists, so the trigger finds no PENDING invite.
//   • Existing users → add CONDÓMINO role directly, no email.
// Empty invite list returns immediately with sent: 0.
// ---------------------------------------------------------------------------

export async function inviteCondominos(
  buildingId: string,
  invites:    { email: string; unitId?: string }[],
): Promise<InviteResult> {
  const session = await getServerSession();
  if (!session) return { sent: 0, errors: ["Não autenticado."] };

  if (invites.length === 0) return { sent: 0, errors: [] };

  const parsed = inviteInputSchema.safeParse({ buildingId, invites });
  if (!parsed.success) return { sent: 0, errors: ["Dados inválidos."] };

  const admin = createServerSupabaseClient();

  // Caller must be GESTOR for this building.
  const { data: roleRow } = await admin
    .from("user_building_roles")
    .select("role")
    .eq("building_id", buildingId)
    .eq("user_id", session.user.id)
    .eq("role", "GESTOR")
    .maybeSingle();

  if (!roleRow) {
    return { sent: 0, errors: ["Sem permissão para convidar membros neste edifício."] };
  }

  const { data: buildingRow } = await admin
    .from("buildings")
    .select("name")
    .eq("id", buildingId)
    .single();

  const buildingName =
    (buildingRow as { name: string } | null)?.name ?? "CondoFlow";
  const siteUrl =
    process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

  const errors: string[] = [];
  let sent = 0;

  for (const invite of invites) {
    const email = invite.email.trim().toLowerCase();

    try {
      const { data: linkData, error: linkError } =
        await admin.auth.admin.generateLink({
          type:    "invite",
          email,
          options: { redirectTo: `${siteUrl}/auth/callback` },
        });

      if (linkError) {
        // User already exists — add role directly without an invite email.
        const { data: listData } = await admin.auth.admin.listUsers({
          page:    1,
          perPage: 1000,
        });
        const existingUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === email,
        );

        if (existingUser) {
          await admin.from("user_building_roles").upsert(
            { user_id: existingUser.id, building_id: buildingId, role: "CONDÓMINO" },
            { onConflict: "user_id,building_id" },
          );
          sent++;
        } else {
          errors.push(`Não foi possível convidar ${email}.`);
        }
        continue;
      }

      // generateLink(type: "invite") creates the auth.users row immediately,
      // so handle_new_user has already fired — before any invitation row
      // exists. The trigger therefore cannot assign the role on this path;
      // assign it here with the user id generateLink returned. (The trigger
      // still covers organic /register sign-ups with a pre-existing invite.)
      const invitedUserId =
        (linkData as { user?: { id: string } } | null)?.user?.id ?? null;

      await admin.from("building_invitations").upsert(
        {
          building_id: buildingId,
          email,
          unit_id:    invite.unitId ?? null,
          status:     invitedUserId ? "ACCEPTED" : "PENDING",
          invited_by: session.user.id,
        },
        { onConflict: "building_id,email" },
      );

      if (invitedUserId) {
        const { error: roleError } = await admin
          .from("user_building_roles")
          .upsert(
            { user_id: invitedUserId, building_id: buildingId, role: "CONDÓMINO" },
            { onConflict: "user_id,building_id" },
          );
        if (roleError) {
          errors.push(`Erro ao atribuir papel a ${email}.`);
          continue;
        }
      }

      const actionLink =
        (linkData as { properties?: { action_link?: string } } | null)
          ?.properties?.action_link ?? `${siteUrl}/login`;

      await sendEmail("WELCOME", email, {
        building_name: buildingName,
        magic_link:    actionLink,
      });

      sent++;
    } catch {
      errors.push(`Erro ao convidar ${email}.`);
    }
  }

  return { sent, errors };
}
