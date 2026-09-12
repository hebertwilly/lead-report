import type { AnalyticsMetrics, AnalyticsMetricTotals, MetricInput } from "@/lib/analytics/types";

export function emptyMetricTotals(): AnalyticsMetricTotals {
  return { leadsReceived: 0, leadsAnswered: 0, leadsInterested: 0, sales: 0, revenueCents: 0 };
}

export function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

export function aggregateMetrics(rows: readonly MetricInput[]): AnalyticsMetrics {
  const totals = rows.reduce<AnalyticsMetricTotals>((result, row) => ({
    leadsReceived: result.leadsReceived + row.leadsReceived,
    leadsAnswered: result.leadsAnswered + row.leadsAnswered,
    leadsInterested: result.leadsInterested + row.leadsInterested,
    sales: result.sales + row.sales,
    revenueCents: result.revenueCents + row.revenueCents,
  }), emptyMetricTotals());

  return {
    ...totals,
    attendance: safeRatio(totals.leadsAnswered, totals.leadsReceived),
    interest: safeRatio(totals.leadsInterested, totals.leadsAnswered),
    conversion: safeRatio(totals.sales, totals.leadsReceived),
    interestedConversion: safeRatio(totals.sales, totals.leadsInterested),
    averageTicketCents: totals.sales > 0 ? Math.round(totals.revenueCents / totals.sales) : 0,
  };
}

/** Converte o numeric do PostgreSQL para centavos antes de qualquer soma. */
export function decimalToCents(value: string | number) {
  const normalized = String(value);
  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return 0;
  const decimals = `${match[2] ?? ""}00`.slice(0, 2);
  return Number(match[1]) * 100 + Number(decimals);
}
