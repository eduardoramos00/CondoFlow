import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Public types (consumed by the route handler)
// ---------------------------------------------------------------------------

export type PdfBuilding = {
  name: string;
  address: string;
  fiscal_number: string;
};

export type PdfAssembly = {
  id: string;
  type: string;
  status: string;
  scheduled_at: string;
  quorum_required: number;
  location: string | null;
};

export type PdfAgendaItem = {
  id: string;
  order_index: number;
  title: string;
  description: string | null;
  voting_enabled: boolean;
};

export type PdfVoteTally = {
  favor: number;
  against: number;
  abstain: number;
};

export type PdfAta = {
  content: string;
  finalized_at: string | null;
};

export type AtaPdfDocumentProps = {
  building: PdfBuilding;
  assembly: PdfAssembly;
  agendaItems: PdfAgendaItem[];
  tallies: Record<string, PdfVoteTally>;
  ata: PdfAta;
};

// ---------------------------------------------------------------------------
// HTML → block parser
// ---------------------------------------------------------------------------

type TextBlock =
  | { kind: "h1" | "h2" | "h3" | "p"; text: string }
  | { kind: "li"; text: string; bullet: string };

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseHtml(html: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  // Match outermost block-level elements.
  const blockRe = /<(h1|h2|h3|p|ul|ol)(?: [^>]*)?>[\s\S]*?<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(html)) !== null) {
    const full = match[0];
    const tag = match[1]!.toLowerCase() as "h1" | "h2" | "h3" | "p" | "ul" | "ol";

    if (tag === "ul" || tag === "ol") {
      const isOrdered = tag === "ol";
      const liRe = /<li(?: [^>]*)?>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      let n = 1;
      while ((liMatch = liRe.exec(full)) !== null) {
        const text = stripTags(liMatch[1]!);
        if (text) {
          blocks.push({ kind: "li", text, bullet: isOrdered ? `${n++}.` : "•" });
        }
      }
    } else {
      const innerRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const text = stripTags(innerRe.exec(full)?.[1] ?? "");
      if (text) blocks.push({ kind: tag as "h1" | "h2" | "h3" | "p", text });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 50,
    paddingBottom: 65,
    paddingHorizontal: 55,
    color: "#1a1a1a",
    lineHeight: 1.4,
  },
  // Header
  buildingName: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 3,
  },
  buildingAddress: {
    fontSize: 9,
    textAlign: "center",
    color: "#555555",
    marginBottom: 2,
  },
  buildingFiscal: {
    fontSize: 9,
    textAlign: "center",
    color: "#777777",
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#cccccc",
    marginVertical: 12,
  },
  assemblyType: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 4,
  },
  assemblyMeta: {
    fontSize: 9,
    textAlign: "center",
    color: "#555555",
    marginBottom: 2,
  },
  // Section
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    marginTop: 4,
  },
  // Agenda
  agendaItem: {
    marginBottom: 8,
    paddingLeft: 8,
  },
  agendaItemTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 1,
  },
  agendaItemDesc: {
    fontSize: 9,
    color: "#555555",
    marginBottom: 2,
  },
  tallyText: {
    fontSize: 9,
    color: "#333333",
    marginTop: 2,
  },
  // Ata body
  ataH1: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 5 },
  ataH2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4 },
  ataH3: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 3 },
  ataParagraph: { fontSize: 10, lineHeight: 1.5, marginBottom: 6 },
  ataListItem: { fontSize: 10, lineHeight: 1.4, marginBottom: 3, paddingLeft: 10 },
  // Signatures
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 28 },
  sigBlock: { width: "45%" },
  sigLine: { borderBottomWidth: 0.5, borderBottomColor: "#999999", marginBottom: 5 },
  sigLabel: { fontSize: 9, color: "#666666" },
  finalizedDate: { fontSize: 9, color: "#888888", marginTop: 14 },
  // Page number
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 28,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#aaaaaa",
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ASSEMBLY_TYPE_LABELS: Record<string, string> = {
  "ORDINÁRIA": "Assembleia Geral Ordinária",
  "EXTRAORDINÁRIA": "Assembleia Geral Extraordinária",
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Document component
// ---------------------------------------------------------------------------

export function AtaPdfDocument({
  building,
  assembly,
  agendaItems,
  tallies,
  ata,
}: AtaPdfDocumentProps) {
  const ataBlocks = parseHtml(ata.content);
  const typeLabel = ASSEMBLY_TYPE_LABELS[assembly.type] ?? assembly.type;

  return (
    <Document
      title={`Ata — ${typeLabel}`}
      author={building.name}
      creator="CondoFlow"
    >
      <Page size="A4" style={S.page}>
        {/* Building header */}
        <Text style={S.buildingName}>{building.name}</Text>
        <Text style={S.buildingAddress}>{building.address}</Text>
        <Text style={S.buildingFiscal}>NIF: {building.fiscal_number}</Text>

        <View style={S.divider} />

        {/* Assembly metadata */}
        <Text style={S.assemblyType}>{typeLabel}</Text>
        <Text style={S.assemblyMeta}>{fmtDateTime(assembly.scheduled_at)}</Text>
        {assembly.location ? (
          <Text style={S.assemblyMeta}>Local: {assembly.location}</Text>
        ) : null}
        <Text style={S.assemblyMeta}>
          Quórum exigido: {assembly.quorum_required}%
        </Text>

        <View style={S.divider} />

        {/* Agenda items */}
        <Text style={S.sectionTitle}>ORDEM DO DIA</Text>
        {agendaItems.map((item, idx) => {
          const tally = tallies[item.id];
          return (
            <View key={item.id} style={S.agendaItem}>
              <Text style={S.agendaItemTitle}>
                {idx + 1}. {item.title}
              </Text>
              {item.description ? (
                <Text style={S.agendaItemDesc}>{item.description}</Text>
              ) : null}
              {item.voting_enabled && tally ? (
                <Text style={S.tallyText}>
                  {`Votação — A Favor: ${tally.favor}‰  |  Abstenção: ${tally.abstain}‰  |  Contra: ${tally.against}‰`}
                </Text>
              ) : null}
            </View>
          );
        })}

        <View style={S.divider} />

        {/* Ata body */}
        <Text style={S.sectionTitle}>ATA</Text>
        {ataBlocks.map((block, i) => {
          if (block.kind === "h1") {
            return <Text key={i} style={S.ataH1}>{block.text}</Text>;
          }
          if (block.kind === "h2") {
            return <Text key={i} style={S.ataH2}>{block.text}</Text>;
          }
          if (block.kind === "h3") {
            return <Text key={i} style={S.ataH3}>{block.text}</Text>;
          }
          if (block.kind === "li") {
            return (
              <Text key={i} style={S.ataListItem}>
                {block.bullet}{"  "}{block.text}
              </Text>
            );
          }
          return <Text key={i} style={S.ataParagraph}>{block.text}</Text>;
        })}

        <View style={S.divider} />

        {/* Signature block */}
        <View style={S.sigRow}>
          <View style={S.sigBlock}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Presidente da Mesa</Text>
          </View>
          <View style={S.sigBlock}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Secretário/a</Text>
          </View>
        </View>

        {ata.finalized_at ? (
          <Text style={S.finalizedDate}>
            Ata aprovada em {fmtDate(ata.finalized_at)}
          </Text>
        ) : null}

        {/* Page number footer */}
        <Text
          style={S.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
