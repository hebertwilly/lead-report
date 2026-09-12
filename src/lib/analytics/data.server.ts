import "server-only";

import { getDatesInRange, identifyPeriodPreset, resolveComparisonPeriod, resolvePeriod } from "@/lib/analytics/comparison";
import { calculateGoalProgress } from "@/lib/analytics/goals";
import { aggregateMetrics, decimalToCents } from "@/lib/analytics/metrics";
import { getPendingDates, type PendingDayInput } from "@/lib/analytics/pending";
import { buildExecutiveInsights } from "@/lib/analytics/summary";
import type {
  AnalyticsDayStatus,
  AnalyticsFilters,
  AnalyticsGoal,
  AnalyticsLeadSource,
  ClientAnalyticsData,
  ComparisonMode,
  DateRange,
  MetricInput,
  ObjectionAnalytics,
  SourceAnalytics,
} from "@/lib/analytics/types";
import { OBJECTION_TYPES } from "@/lib/reports/constants";
import { isChargeableReportDate, isDateWithinActivePeriod } from "@/lib/reports/date";
import { createClient } from "@/lib/supabase/server";
import type { ClientGoalMetricType, ObjectionType, ReportSourceStatus } from "@/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPARISON_MODES: readonly ComparisonMode[] = ["none", "previous-period", "previous-month", "custom"];

export type AnalyticsSearchParams = {
  from?: string;
  to?: string;
  compare?: string;
  comparisonFrom?: string;
  comparisonTo?: string;
  source?: string;
};

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  reporting_started_at: string;
  profiles: Array<{ username: string; active: boolean; role: string }> | null;
};
type SourceRow = {
  id: string;
  name: string;
  key: string;
  is_active: boolean;
  is_primary: boolean;
  sort_order: number;
  lead_source_active_periods: Array<{ active_from: string; inactive_from: string | null }> | null;
};
type GoalRow = { id: string; name: string; metric_type: ClientGoalMetricType; target_value: string | number };
type ObjectionRow = { type: ObjectionType; quantity: number };
type CityRow = { city: string; state: string; quantity: number };
type ReportSourceRow = {
  id: string;
  lead_source_id: string;
  status: ReportSourceStatus;
  leads_received: number;
  leads_answered: number;
  leads_interested: number;
  sales: number;
  revenue: string | number;
  objections: ObjectionRow[] | null;
  shipping_cities: CityRow[] | null;
};
type DailyReportRow = { id: string; report_date: string; report_sources: ReportSourceRow[] | null };

function mapSource(row: SourceRow): AnalyticsLeadSource {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    isActive: row.is_active,
    isPrimary: row.is_primary,
    sortOrder: row.sort_order,
    periods: (row.lead_source_active_periods ?? []).map((period) => ({ activeFrom: period.active_from, inactiveFrom: period.inactive_from })),
  };
}

function toMetricInput(row: ReportSourceRow): MetricInput {
  return {
    status: row.status,
    leadsReceived: row.leads_received,
    leadsAnswered: row.leads_answered,
    leadsInterested: row.leads_interested,
    sales: row.sales,
    revenueCents: decimalToCents(row.revenue),
  };
}

function isReported(row: ReportSourceRow) {
  return row.status === "FILLED" || row.status === "NO_CONTACTS";
}

function belongsToRange(date: string, range: DateRange) {
  return date >= range.from && date <= range.to;
}

function activeSourceIds(sources: readonly AnalyticsLeadSource[], date: string, sourceId: string | null) {
  return sources
    .filter((source) => (!sourceId || source.id === sourceId) && source.periods.some((period) => isDateWithinActivePeriod(date, period.activeFrom, period.inactiveFrom)))
    .map((source) => source.id);
}

function mergeRanges(ranges: DateRange[]) {
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  const merged: DateRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.from > last.to) merged.push({ ...range });
    else if (range.to > last.to) last.to = range.to;
  }
  return merged;
}

function resolveFilters(params: AnalyticsSearchParams, today: string): AnalyticsFilters {
  const periodResult = resolvePeriod(params.from, params.to, today);
  const comparisonMode = COMPARISON_MODES.includes(params.compare as ComparisonMode) ? params.compare as ComparisonMode : "none";
  const comparisonResult = resolveComparisonPeriod(comparisonMode, periodResult.range, today, params.comparisonFrom, params.comparisonTo);
  return {
    period: periodResult.range,
    periodPreset: identifyPeriodPreset(periodResult.range, today),
    comparisonMode,
    comparisonPeriod: comparisonResult.range,
    sourceId: params.source || null,
    validationMessage: periodResult.validationMessage ?? comparisonResult.validationMessage,
  };
}

function getDayStatus(requiredSourceIds: readonly string[], allRows: readonly ReportSourceRow[], chargeable: boolean): AnalyticsDayStatus {
  const reportedIds = allRows.filter(isReported).map((row) => row.lead_source_id);
  if (requiredSourceIds.length === 0) return reportedIds.length ? "FILLED" : "NOT_REQUIRED";
  const completed = requiredSourceIds.filter((id) => reportedIds.includes(id)).length;
  if (completed === requiredSourceIds.length) return "FILLED";
  if (completed > 0) return "PARTIAL";
  return chargeable ? "PENDING" : allRows.some((row) => row.status === "PENDING") ? "PARTIAL" : "NOT_REQUIRED";
}

function buildSourceAnalytics(rows: readonly ReportSourceRow[], sources: readonly AnalyticsLeadSource[]): SourceAnalytics[] {
  return sources.flatMap((source) => {
    const sourceRows = rows.filter((row) => row.lead_source_id === source.id && isReported(row));
    return sourceRows.length ? [{ sourceId: source.id, sourceName: source.name, metrics: aggregateMetrics(sourceRows.map(toMetricInput)) }] : [];
  }).sort((a, b) => b.metrics.sales - a.metrics.sales || b.metrics.leadsReceived - a.metrics.leadsReceived || a.sourceName.localeCompare(b.sourceName, "pt-BR"));
}

function buildObjections(rows: readonly ReportSourceRow[]): ObjectionAnalytics[] {
  const quantities = new Map<ObjectionType, number>();
  for (const row of rows.filter(isReported)) {
    for (const objection of row.objections ?? []) quantities.set(objection.type, (quantities.get(objection.type) ?? 0) + objection.quantity);
  }
  const total = [...quantities.values()].reduce((sum, value) => sum + value, 0);
  return OBJECTION_TYPES.map(({ type, label }) => ({ type, label, quantity: quantities.get(type) ?? 0, share: total > 0 ? (quantities.get(type) ?? 0) / total : 0 }))
    .filter((item) => item.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label, "pt-BR"));
}

function buildCities(rows: readonly ReportSourceRow[]) {
  const quantities = new Map<string, { city: string; state: string; quantity: number }>();
  for (const row of rows.filter(isReported)) {
    for (const shipping of row.shipping_cities ?? []) {
      const key = `${shipping.city.trim().toLocaleLowerCase("pt-BR")}|${shipping.state}`;
      const current = quantities.get(key) ?? { city: shipping.city.trim(), state: shipping.state, quantity: 0 };
      current.quantity += shipping.quantity;
      quantities.set(key, current);
    }
  }
  const total = [...quantities.values()].reduce((sum, item) => sum + item.quantity, 0);
  return [...quantities.values()].map((item) => ({ ...item, share: total > 0 ? item.quantity / total : 0 }))
    .sort((a, b) => b.quantity - a.quantity || a.city.localeCompare(b.city, "pt-BR"));
}

export async function getClientAnalyticsData(clientId: string, params: AnalyticsSearchParams, today: string): Promise<ClientAnalyticsData | null> {
  if (!UUID_PATTERN.test(clientId)) return null;
  const filters = resolveFilters(params, today);
  const showGoals = filters.period.from.slice(0, 7) === today.slice(0, 7) && filters.period.to.slice(0, 7) === today.slice(0, 7);
  const goalRange = { from: `${today.slice(0, 7)}-01`, to: today };
  const queryRanges = mergeRanges([filters.period, ...(filters.comparisonPeriod ? [filters.comparisonPeriod] : []), ...(showGoals ? [goalRange] : [])]);
  const supabase = await createClient();
  const reportSelect = "id, report_date, report_sources(id, lead_source_id, status, leads_received, leads_answered, leads_interested, sales, revenue, objections(type, quantity), shipping_cities(city, state, quantity))";

  const [clientResult, sourcesResult, goalsResult, reportResults] = await Promise.all([
    supabase.from("clients").select("id, name, slug, active, reporting_started_at, profiles(username, active, role)").eq("id", clientId).maybeSingle(),
    supabase.from("lead_sources").select("id, name, key, is_active, is_primary, sort_order, lead_source_active_periods(active_from, inactive_from)").eq("client_id", clientId).order("sort_order").order("name"),
    supabase.from("client_goals").select("id, name, metric_type, target_value").eq("client_id", clientId).eq("active", true).order("created_at"),
    Promise.all(queryRanges.map((range) => supabase.from("daily_reports").select(reportSelect).eq("client_id", clientId).gte("report_date", range.from).lte("report_date", range.to).order("report_date"))),
  ]);

  if (clientResult.error || sourcesResult.error || goalsResult.error || reportResults.some((result) => result.error)) {
    throw new Error("Não foi possível carregar a análise deste cliente.");
  }
  if (!clientResult.data) return null;

  const clientRow = clientResult.data as unknown as ClientRow;
  const sources = (sourcesResult.data as unknown as SourceRow[] ?? []).map(mapSource);
  const validSourceId = filters.sourceId && sources.some((source) => source.id === filters.sourceId) ? filters.sourceId : null;
  if (filters.sourceId && !validSourceId) filters.validationMessage = filters.validationMessage ?? "A origem selecionada não pertence a este cliente. Exibimos todas as origens.";
  filters.sourceId = validSourceId;

  const reportMap = new Map<string, DailyReportRow>();
  for (const result of reportResults) {
    for (const report of (result.data as unknown as DailyReportRow[] ?? [])) reportMap.set(report.id, report);
  }
  const reports = [...reportMap.values()];
  const rowsFor = (range: DateRange) => reports
    .filter((report) => belongsToRange(report.report_date, range))
    .flatMap((report) => (report.report_sources ?? []).filter((row) => !validSourceId || row.lead_source_id === validSourceId));
  const currentRows = rowsFor(filters.period);
  const currentReportedRows = currentRows.filter(isReported);
  const current = aggregateMetrics(currentReportedRows.map(toMetricInput));
  const comparison = filters.comparisonPeriod ? aggregateMetrics(rowsFor(filters.comparisonPeriod).filter(isReported).map(toMetricInput)) : null;

  const reportsByDate = new Map(reports.map((report) => [report.report_date, report.report_sources ?? []]));
  const pendingInput: PendingDayInput[] = [];
  const daily = getDatesInRange(filters.period).map((date) => {
    const allRows = (reportsByDate.get(date) ?? []).filter((row) => !validSourceId || row.lead_source_id === validSourceId);
    const reportedRows = allRows.filter(isReported);
    const requiredSourceIds = activeSourceIds(sources, date, validSourceId);
    const chargeable = isChargeableReportDate(date, clientRow.reporting_started_at, today);
    pendingInput.push({ date, chargeable, requiredSourceIds, reportedSourceIds: reportedRows.map((row) => row.lead_source_id) });
    return {
      date,
      metrics: aggregateMetrics(reportedRows.map(toMetricInput)),
      status: getDayStatus(requiredSourceIds, allRows, chargeable),
      hasReportedData: reportedRows.length > 0,
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  const bySource = buildSourceAnalytics(currentRows, sources);
  const objections = buildObjections(currentRows);
  const cities = buildCities(currentRows);
  const pendingDates = getPendingDates(pendingInput);
  const analyticsGoals: AnalyticsGoal[] = (goalsResult.data as unknown as GoalRow[] ?? []).map((goal) => ({
    id: goal.id,
    name: goal.name,
    metricType: goal.metric_type,
    targetValue: Number(goal.target_value),
  }));
  const monthMetrics = aggregateMetrics(rowsFor(goalRange).filter(isReported).map(toMetricInput));
  const goals = showGoals ? calculateGoalProgress(analyticsGoals, monthMetrics, today) : null;
  const insights = buildExecutiveInsights({ current, comparison, sources: bySource, objections, goals, pendingDays: pendingDates.length });
  const profile = clientRow.profiles?.find((item) => item.role === "CLIENT") ?? null;

  return {
    client: {
      id: clientRow.id,
      name: clientRow.name,
      slug: clientRow.slug,
      active: clientRow.active,
      accessActive: Boolean(profile?.active),
      username: profile?.username ?? null,
      reportingStartedAt: clientRow.reporting_started_at,
    },
    filters,
    leadSources: sources,
    current,
    comparison,
    daily,
    bySource,
    objections,
    cities,
    pendingDates,
    reportedDays: daily.filter((day) => day.hasReportedData).length,
    goals,
    goalSourceWarning: Boolean(validSourceId && goals),
    insights,
  };
}
