import "server-only";

import { createElement } from "react";
import type { ReactElement } from "react";
import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { z } from "zod";

import { getServerUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const paramsSchema = z.object({
  id: z.string().uuid("assemblyId must be a valid UUID"),
});
import {
  AtaPdfDocument,
  type PdfAssembly,
  type PdfBuilding,
  type PdfAgendaItem,
  type PdfVoteTally,
  type PdfAta,
} from "./AtaPdfDocument";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/assemblies/[id]/ata/export
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const rawParams = await params;
  const parsed = paramsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }
  const { id: assemblyId } = parsed.data;

  // Verify the caller is authenticated.
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServerSupabaseClient();

  // Fetch assembly — establishes building_id for all subsequent tenant checks.
  const { data: assemblyRow, error: assemblyError } = await admin
    .from("assemblies")
    .select("id, building_id, type, status, scheduled_at, quorum_required, location")
    .eq("id", assemblyId)
    .single();

  if (assemblyError || !assemblyRow) {
    return NextResponse.json({ error: "Assembly not found" }, { status: 404 });
  }

  const assembly = assemblyRow as unknown as PdfAssembly & { building_id: string };

  // Verify the caller belongs to this building.
  const { data: roleRow } = await admin
    .from("user_building_roles")
    .select("role")
    .eq("building_id", assembly.building_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!roleRow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isGestor = (roleRow as { role: string }).role === "GESTOR";

  // Fetch ata — must exist.
  const { data: ataRow } = await admin
    .from("atas")
    .select("content, status, finalized_at")
    .eq("assembly_id", assemblyId)
    .maybeSingle();

  if (!ataRow) {
    return NextResponse.json({ error: "Ata not found" }, { status: 404 });
  }

  const ata = ataRow as unknown as PdfAta & { status: string };

  // Non-GESTORs may only download a finalized ata.
  if (!isGestor && ata.status !== "FINALIZED") {
    return NextResponse.json({ error: "Ata not yet published" }, { status: 403 });
  }

  // Fetch building details (name, address, fiscal_number).
  const { data: buildingRow } = await admin
    .from("buildings")
    .select("id, name, address, fiscal_number")
    .eq("id", assembly.building_id)
    .single();

  if (!buildingRow) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  const building = buildingRow as unknown as PdfBuilding;

  // Fetch agenda items ordered by position.
  const { data: itemRows } = await admin
    .from("agenda_items")
    .select("id, order_index, title, description, voting_enabled, voting_status")
    .eq("assembly_id", assemblyId)
    .order("order_index", { ascending: true });

  const agendaItems = (itemRows ?? []) as unknown as PdfAgendaItem[];

  // Fetch all votes for voting-enabled items in a single query, then aggregate.
  const votingItemIds = agendaItems
    .filter((i) => i.voting_enabled)
    .map((i) => i.id);

  const tallies: Record<string, PdfVoteTally> = {};

  if (votingItemIds.length > 0) {
    const { data: voteRows } = await admin
      .from("votes")
      .select("agenda_item_id, vote, weighted_permilagem")
      .in("agenda_item_id", votingItemIds);

    type VoteRow = {
      agenda_item_id: string;
      vote: "FAVOR" | "AGAINST" | "ABSTAIN";
      weighted_permilagem: number;
    };

    const rows = (voteRows ?? []) as unknown as VoteRow[];

    for (const itemId of votingItemIds) {
      tallies[itemId] = rows
        .filter((v) => v.agenda_item_id === itemId)
        .reduce<PdfVoteTally>(
          (acc, v) => {
            if (v.vote === "FAVOR") acc.favor += v.weighted_permilagem;
            else if (v.vote === "AGAINST") acc.against += v.weighted_permilagem;
            else acc.abstain += v.weighted_permilagem;
            return acc;
          },
          { favor: 0, against: 0, abstain: 0 },
        );
    }
  }

  // Render the PDF.
  // Cast needed: renderToBuffer expects ReactElement<DocumentProps> but we pass
  // a wrapper component whose props are AtaPdfDocumentProps (not DocumentProps).
  const element = createElement(AtaPdfDocument, {
    building,
    assembly,
    agendaItems,
    tallies,
    ata,
  }) as unknown as ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(element);

  // Build a human-readable filename.
  const dateSlug = new Date(assembly.scheduled_at).toISOString().slice(0, 10);
  const typeSlug = assembly.type === "ORDINÁRIA" ? "ordinaria" : "extraordinaria";
  const filename = `ata-${typeSlug}-${dateSlug}.pdf`;

  // Convert Buffer to Uint8Array for the Web API Response constructor.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
