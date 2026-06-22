import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/utils/currency";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AnnualBudgetBuilding = {
  name: string;
  address: string;
  fiscal_number: string;
};

export type AnnualBudgetLineItem = {
  category: string;
  description: string | null;
  amount_cents: number;
};

export type AnnualBudgetDocumentProps = {
  building: AnnualBudgetBuilding;
  fiscal_year: number;
  status: string;
  total_amount_cents: number;
  reserve_amount_cents: number;
  line_items: AnnualBudgetLineItem[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  MAINTENANCE: "Manutenção",
  WATER: "Água",
  ELECTRICITY: "Eletricidade",
  INSURANCE: "Seguros",
  CLEANING: "Limpeza",
  ELEVATOR: "Elevador",
  ADMINISTRATIVE: "Administrativo",
  OTHER: "Outros",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  APPROVED: "Aprovado",
};

function fmtDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function reservePct(reserve: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((reserve * 100) / total)}%`;
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
  buildingName: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 3,
  },
  buildingMeta: {
    fontSize: 9,
    textAlign: "center",
    color: "#555555",
    marginBottom: 2,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#cccccc",
    marginVertical: 12,
  },
  docTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 4,
  },
  docMeta: {
    fontSize: 9,
    textAlign: "center",
    color: "#555555",
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#aaaaaa",
    paddingBottom: 4,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#777777",
  },
  colCategory: { flex: 2 },
  colDescription: { flex: 3 },
  colAmount: { width: 80, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.3,
    borderBottomColor: "#eeeeee",
  },
  tableCell: { fontSize: 9, color: "#333333" },
  tableCellRight: { fontSize: 9, color: "#333333", textAlign: "right" },
  itemsTotalRow: {
    flexDirection: "row",
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: "#999999",
  },
  itemsTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", flex: 1 },
  itemsTotalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", width: 80, textAlign: "right" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 0.3,
    borderBottomColor: "#eeeeee",
  },
  summaryLabel: { fontSize: 9, color: "#555555", flex: 2 },
  summaryValue: { fontSize: 9, color: "#1a1a1a", textAlign: "right", flex: 1 },
  footer: {
    position: "absolute",
    fontSize: 7,
    bottom: 20,
    left: 55,
    right: 55,
    textAlign: "center",
    color: "#bbbbbb",
  },
  pageNumber: {
    position: "absolute",
    fontSize: 8,
    bottom: 30,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#aaaaaa",
  },
});

// ---------------------------------------------------------------------------
// Document component
// ---------------------------------------------------------------------------

export function AnnualBudgetReportDocument({
  building,
  fiscal_year,
  status,
  total_amount_cents,
  reserve_amount_cents,
  line_items,
}: AnnualBudgetDocumentProps) {
  const lineItemsTotal = line_items.reduce((s, i) => s + i.amount_cents, 0);
  const today = fmtDate(new Date().toISOString());

  return (
    <Document
      title={`Orçamento Anual ${fiscal_year} — ${building.name}`}
      author={building.name}
      creator="CondoFlow"
    >
      <Page size="A4" style={S.page}>
        <Text style={S.buildingName}>{building.name}</Text>
        <Text style={S.buildingMeta}>{building.address}</Text>
        <Text style={S.buildingMeta}>NIF: {building.fiscal_number}</Text>

        <View style={S.divider} />

        <Text style={S.docTitle}>ORÇAMENTO ANUAL — {String(fiscal_year)}</Text>
        <Text style={S.docMeta}>Estado: {STATUS_LABELS[status] ?? status}</Text>

        <View style={S.divider} />

        <Text style={S.sectionTitle}>ITENS DO ORÇAMENTO</Text>

        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderCell, S.colCategory]}>Categoria</Text>
          <Text style={[S.tableHeaderCell, S.colDescription]}>Descrição</Text>
          <Text style={[S.tableHeaderCell, S.colAmount]}>Montante</Text>
        </View>

        {line_items.map((item, i) => (
          <View key={i} style={S.tableRow}>
            <Text style={[S.tableCell, S.colCategory]}>
              {CATEGORY_LABELS[item.category] ?? item.category}
            </Text>
            <Text style={[S.tableCell, S.colDescription]}>
              {item.description ?? "—"}
            </Text>
            <Text style={[S.tableCellRight, S.colAmount]}>
              {formatCurrency(item.amount_cents)}
            </Text>
          </View>
        ))}

        {line_items.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#999999", marginTop: 6 }}>
            Nenhum item adicionado
          </Text>
        ) : null}

        <View style={S.itemsTotalRow}>
          <Text style={S.itemsTotalLabel}>Total de itens</Text>
          <Text style={S.itemsTotalValue}>{formatCurrency(lineItemsTotal)}</Text>
        </View>

        <View style={S.divider} />

        <Text style={S.sectionTitle}>RESUMO</Text>
        <View style={S.summaryRow}>
          <Text style={S.summaryLabel}>Total do orçamento</Text>
          <Text style={S.summaryValue}>{formatCurrency(total_amount_cents)}</Text>
        </View>
        <View style={S.summaryRow}>
          <Text style={S.summaryLabel}>
            {`Fundo de Reserva (${reservePct(reserve_amount_cents, total_amount_cents)})`}
          </Text>
          <Text style={S.summaryValue}>{formatCurrency(reserve_amount_cents)}</Text>
        </View>
        <View style={S.summaryRow}>
          <Text style={S.summaryLabel}>Custo operacional</Text>
          <Text style={S.summaryValue}>
            {formatCurrency(total_amount_cents - reserve_amount_cents)}
          </Text>
        </View>
        <View style={S.summaryRow}>
          <Text style={S.summaryLabel}>Quota mensal média por fração</Text>
          <Text style={S.summaryValue}>
            {formatCurrency(Math.round(total_amount_cents / 12))}
          </Text>
        </View>

        <Text style={S.footer}>
          {`Documento gerado em ${today} · CondoFlow`}
        </Text>
        <Text
          style={S.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
