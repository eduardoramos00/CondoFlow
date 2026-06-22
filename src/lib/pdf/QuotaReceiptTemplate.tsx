import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/utils/currency";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type QuotaReceiptBuilding = {
  name: string;
  address: string;
  fiscal_number: string;
};

export type QuotaReceiptUnit = {
  identifier: string;
  floor: number;
};

export type QuotaReceiptQuota = {
  due_date: string;
  amount_cents: number;
  reserve_cents: number;
  status: string;
  paid_at: string | null;
};

export type QuotaReceiptDocumentProps = {
  building: QuotaReceiptBuilding;
  unit: QuotaReceiptUnit;
  ownerName: string | null;
  quota: QuotaReceiptQuota;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PT_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

function fmtMonthYear(isoDate: string): string {
  const parts = isoDate.split("-");
  const m = parseInt(parts[1] ?? "1", 10);
  return `${PT_MONTHS[m - 1] ?? parts[1]} ${parts[0]}`;
}

function fmtDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Em Atraso",
  WAIVED: "Isento",
};

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
  docPeriod: {
    fontSize: 10,
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 0.3,
    borderBottomColor: "#eeeeee",
  },
  rowLabel: { fontSize: 9, color: "#555555", flex: 1 },
  rowValue: { fontSize: 9, color: "#1a1a1a", textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    marginTop: 2,
    borderTopWidth: 0.5,
    borderTopColor: "#999999",
  },
  totalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", flex: 1 },
  totalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
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

export function QuotaReceiptDocument({
  building,
  unit,
  ownerName,
  quota,
}: QuotaReceiptDocumentProps) {
  const period = fmtMonthYear(quota.due_date);
  const totalCents = quota.amount_cents + quota.reserve_cents;
  const today = fmtDate(new Date().toISOString());

  return (
    <Document
      title={`Recibo de Quota — ${period}`}
      author={building.name}
      creator="CondoFlow"
    >
      <Page size="A4" style={S.page}>
        <Text style={S.buildingName}>{building.name}</Text>
        <Text style={S.buildingMeta}>{building.address}</Text>
        <Text style={S.buildingMeta}>NIF: {building.fiscal_number}</Text>

        <View style={S.divider} />

        <Text style={S.docTitle}>RECIBO DE QUOTA</Text>
        <Text style={S.docPeriod}>Período: {period}</Text>

        <View style={S.divider} />

        <Text style={S.sectionTitle}>FRAÇÃO</Text>
        <View style={S.row}>
          <Text style={S.rowLabel}>Identificação</Text>
          <Text style={S.rowValue}>{unit.identifier}</Text>
        </View>
        <View style={S.row}>
          <Text style={S.rowLabel}>Piso</Text>
          <Text style={S.rowValue}>{String(unit.floor)}</Text>
        </View>
        {ownerName ? (
          <View style={S.row}>
            <Text style={S.rowLabel}>Condómino</Text>
            <Text style={S.rowValue}>{ownerName}</Text>
          </View>
        ) : null}

        <View style={S.divider} />

        <Text style={S.sectionTitle}>VALOR</Text>
        <View style={S.row}>
          <Text style={S.rowLabel}>Quota de Condomínio</Text>
          <Text style={S.rowValue}>{formatCurrency(quota.amount_cents)}</Text>
        </View>
        <View style={S.row}>
          <Text style={S.rowLabel}>Fundo de Reserva</Text>
          <Text style={S.rowValue}>{formatCurrency(quota.reserve_cents)}</Text>
        </View>
        <View style={S.totalRow}>
          <Text style={S.totalLabel}>Total</Text>
          <Text style={S.totalValue}>{formatCurrency(totalCents)}</Text>
        </View>

        <View style={S.divider} />

        <Text style={S.sectionTitle}>ESTADO</Text>
        <View style={S.row}>
          <Text style={S.rowLabel}>Estado do pagamento</Text>
          <Text style={S.rowValue}>{STATUS_LABELS[quota.status] ?? quota.status}</Text>
        </View>
        {quota.paid_at ? (
          <View style={S.row}>
            <Text style={S.rowLabel}>Data de pagamento</Text>
            <Text style={S.rowValue}>{fmtDate(quota.paid_at)}</Text>
          </View>
        ) : null}

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
