import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/utils/currency";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ExpenseReportBuilding = {
  name: string;
  address: string;
  fiscal_number: string;
};

export type ExpenseReportItem = {
  id: string;
  supplier_name: string;
  category: string;
  description: string | null;
  amount_cents: number;
  expense_date: string;
  status: string;
};

export type ExpenseReportDocumentProps = {
  building: ExpenseReportBuilding;
  expenses: ExpenseReportItem[];
  dateFrom: string | null;
  dateTo: string | null;
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
  AWAITING_APPROVAL: "Ag. Aprovação",
  APPROVED: "Aprovado",
  RECONCILED: "Reconciliado",
};

function fmtDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function buildDateLabel(from: string | null, to: string | null): string {
  if (from && to) return `${fmtDate(from)} a ${fmtDate(to)}`;
  if (from) return `A partir de ${fmtDate(from)}`;
  if (to) return `Até ${fmtDate(to)}`;
  return "Todas as datas";
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
    paddingHorizontal: 45,
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
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#aaaaaa",
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#777777",
  },
  colDate: { width: 56 },
  colSupplier: { flex: 2 },
  colDesc: { flex: 2 },
  colStatus: { width: 72 },
  colAmount: { width: 68, textAlign: "right" },
  categoryTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 4,
    paddingVertical: 3,
    marginTop: 8,
    marginBottom: 2,
  },
  categoryGroup: { marginBottom: 4 },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.3,
    borderBottomColor: "#eeeeee",
  },
  tableCell: { fontSize: 8, color: "#333333" },
  tableCellRight: { fontSize: 8, color: "#333333", textAlign: "right" },
  subtotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 3,
    paddingBottom: 1,
    borderTopWidth: 0.3,
    borderTopColor: "#cccccc",
    marginTop: 1,
    gap: 8,
  },
  subtotalLabel: { fontSize: 8, color: "#666666" },
  subtotalValue: { fontSize: 8, fontFamily: "Helvetica-Bold", width: 68, textAlign: "right" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 6,
    marginTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: "#999999",
    gap: 8,
  },
  grandTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  grandTotalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", width: 68, textAlign: "right" },
  emptyText: { fontSize: 9, color: "#999999", marginTop: 8, textAlign: "center" },
  footer: {
    position: "absolute",
    fontSize: 7,
    bottom: 20,
    left: 45,
    right: 45,
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

export function ExpenseReportDocument({
  building,
  expenses,
  dateFrom,
  dateTo,
}: ExpenseReportDocumentProps) {
  // Group by category preserving insertion order
  const grouped = new Map<string, ExpenseReportItem[]>();
  for (const expense of expenses) {
    const list = grouped.get(expense.category) ?? [];
    list.push(expense);
    grouped.set(expense.category, list);
  }

  const grandTotal = expenses.reduce((s, e) => s + e.amount_cents, 0);
  const today = fmtDate(new Date().toISOString());

  return (
    <Document
      title={`Relatório de Despesas — ${building.name}`}
      author={building.name}
      creator="CondoFlow"
    >
      <Page size="A4" style={S.page}>
        <Text style={S.buildingName}>{building.name}</Text>
        <Text style={S.buildingMeta}>{building.address}</Text>
        <Text style={S.buildingMeta}>NIF: {building.fiscal_number}</Text>

        <View style={S.divider} />

        <Text style={S.docTitle}>RELATÓRIO DE DESPESAS</Text>
        <Text style={S.docMeta}>{buildDateLabel(dateFrom, dateTo)}</Text>
        <Text style={S.docMeta}>{`${expenses.length} despesa(s)`}</Text>

        <View style={S.divider} />

        {expenses.length === 0 ? (
          <Text style={S.emptyText}>Nenhuma despesa no período selecionado.</Text>
        ) : (
          <>
            {/* Column headers */}
            <View style={S.tableHeader}>
              <Text style={[S.tableHeaderCell, S.colDate]}>Data</Text>
              <Text style={[S.tableHeaderCell, S.colSupplier]}>Fornecedor</Text>
              <Text style={[S.tableHeaderCell, S.colDesc]}>Descrição</Text>
              <Text style={[S.tableHeaderCell, S.colStatus]}>Estado</Text>
              <Text style={[S.tableHeaderCell, S.colAmount]}>Montante</Text>
            </View>

            {Array.from(grouped.entries()).map(([category, items]) => {
              const subtotal = items.reduce((s, i) => s + i.amount_cents, 0);
              return (
                <View key={category} style={S.categoryGroup}>
                  <Text style={S.categoryTitle}>
                    {CATEGORY_LABELS[category] ?? category}
                  </Text>
                  {items.map((item) => (
                    <View key={item.id} style={S.tableRow}>
                      <Text style={[S.tableCell, S.colDate]}>
                        {fmtDate(item.expense_date)}
                      </Text>
                      <Text style={[S.tableCell, S.colSupplier]}>
                        {item.supplier_name}
                      </Text>
                      <Text style={[S.tableCell, S.colDesc]}>
                        {item.description ?? "—"}
                      </Text>
                      <Text style={[S.tableCell, S.colStatus]}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </Text>
                      <Text style={[S.tableCellRight, S.colAmount]}>
                        {formatCurrency(item.amount_cents)}
                      </Text>
                    </View>
                  ))}
                  <View style={S.subtotalRow}>
                    <Text style={S.subtotalLabel}>Subtotal</Text>
                    <Text style={S.subtotalValue}>{formatCurrency(subtotal)}</Text>
                  </View>
                </View>
              );
            })}

            <View style={S.grandTotalRow}>
              <Text style={S.grandTotalLabel}>Total</Text>
              <Text style={S.grandTotalValue}>{formatCurrency(grandTotal)}</Text>
            </View>
          </>
        )}

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
