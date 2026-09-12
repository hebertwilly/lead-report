import "server-only";

import type { ObjectionType, ReportSourceStatus } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { getChargeableReportDates, getDatesForMonth, getPreviousReportDate, isChargeableReportDate, isDateWithinActivePeriod, safeRate } from "@/lib/reports/date";

type SourceRow = {
  id: string; lead_source_id: string; status: ReportSourceStatus; leads_received: number; leads_answered: number;
  leads_interested: number; sales: number; revenue: number | string; notes: string | null;
};
type ObjectionRow = { type: ObjectionType; quantity: number };
type ShippingCityRow = { id: string; city: string; state: string; quantity: number };
type SourcePeriod = { active_from: string; inactive_from: string | null };
type LeadSourceRow = { id: string; name: string; key: string; is_active: boolean; is_primary: boolean; sort_order: number; lead_source_active_periods: SourcePeriod[] | null };

export type LeadSource = { id: string; name: string; key: string; isActive: boolean; isPrimary: boolean; sortOrder: number; periods: SourcePeriod[] };
export type ReportSource = Omit<SourceRow, "revenue"> & { revenue: number; objections: ObjectionRow[]; shippingCities: ShippingCityRow[] };
export type DailyReport = { id: string; reportDate: string; sources: ReportSource[] };
export type ReportSourceStatusRecord = Pick<ReportSource, "lead_source_id" | "status">;
export type DailyCompletionStatus = "PENDING" | "PARTIAL" | "FILLED";
export type PendingReport = { reportDate: string; sources: ReportSourceStatusRecord[]; leadSources: LeadSource[] };
export type ReportingProgress = { completedDays: number; pendingDays: number; totalDays: number };
export type MonthlyTotals = { leadsReceived: number; leadsAnswered: number; leadsInterested: number; sales: number; revenue: number };
export type DashboardData = { totals: MonthlyTotals; todaySources: ReportSourceStatusRecord[]; todayLeadSources: LeadSource[]; hasMonthlySources: boolean; pendingReports: PendingReport[]; reportingProgress: ReportingProgress };
export type HistoryDay = { reportDate: string; sources: ReportSourceStatusRecord[]; leadSources: LeadSource[]; status: DailyCompletionStatus; isChargeable: boolean };
export type HistoryData = { days: HistoryDay[]; completeDays: number; partialDays: number; pendingDays: number; hasRegisteredReports: boolean };
export type PreviousDayPendingAlert = { reportDate: string; pendingSources: LeadSource[]; pendingDaysThisMonth: number };

const emptyTotals = (): MonthlyTotals => ({ leadsReceived: 0, leadsAnswered: 0, leadsInterested: 0, sales: 0, revenue: 0 });

function mapLeadSource(row: LeadSourceRow): LeadSource { return { id: row.id, name: row.name, key: row.key, isActive: row.is_active, isPrimary: row.is_primary, sortOrder: row.sort_order, periods: row.lead_source_active_periods ?? [] }; }
function mapSource(row: SourceRow, objections: ObjectionRow[], shippingCities: ShippingCityRow[]): ReportSource { return { ...row, revenue: Number(row.revenue), objections, shippingCities }; }

export function getActiveLeadSourcesAtDate(sources: LeadSource[], reportDate: string) {
  return sources.filter((source) => source.periods.some((period) => isDateWithinActivePeriod(reportDate, period.active_from, period.inactive_from))).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
}

export async function getClientLeadSources(clientId: string, reportDate?: string): Promise<LeadSource[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("lead_sources").select("id, name, key, is_active, is_primary, sort_order, lead_source_active_periods(active_from, inactive_from)").eq("client_id", clientId).order("sort_order").order("name");
  if (error) throw new Error("Não foi possível carregar as origens configuradas.");
  const sources = (data as unknown as LeadSourceRow[] ?? []).map(mapLeadSource);
  return reportDate ? getActiveLeadSourcesAtDate(sources, reportDate) : sources;
}

async function getSourcesForDailyReport(dailyReportId: string): Promise<ReportSource[]> {
  const supabase = await createClient();
  const { data: sourceData, error: sourceError } = await supabase.from("report_sources").select("id, lead_source_id, status, leads_received, leads_answered, leads_interested, sales, revenue, notes").eq("daily_report_id", dailyReportId);
  if (sourceError) throw new Error("Não foi possível carregar as origens do reporte.");
  if (!sourceData?.length) return [];
  const rows = sourceData as unknown as SourceRow[];
  const ids = rows.map((source) => source.id);
  const [objectionsResult, shippingResult] = await Promise.all([
    supabase.from("objections").select("report_source_id, type, quantity").in("report_source_id", ids),
    supabase.from("shipping_cities").select("id, report_source_id, city, state, quantity").in("report_source_id", ids),
  ]);
  if (objectionsResult.error || shippingResult.error) throw new Error("Não foi possível carregar os detalhes do reporte.");
  const objectionData = objectionsResult.data;
  const shippingData = shippingResult.data;
  const objections = (objectionData ?? []) as Array<ObjectionRow & { report_source_id: string }>;
  const shippingCities = (shippingData ?? []) as Array<ShippingCityRow & { report_source_id: string }>;
  return rows.map((source) => mapSource(source, objections.filter((item) => item.report_source_id === source.id).map(({ type, quantity }) => ({ type, quantity })), shippingCities.filter((item) => item.report_source_id === source.id).map(({ id, city, state, quantity }) => ({ id, city, state, quantity }))));
}

export async function getDailyReport(clientId: string, reportDate: string): Promise<DailyReport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("daily_reports").select("id, report_date").eq("client_id", clientId).eq("report_date", reportDate).maybeSingle();
  if (error) throw new Error("Não foi possível carregar o reporte diário.");
  if (!data) return null;
  const report = data as { id: string; report_date: string };
  return { id: report.id, reportDate: report.report_date, sources: await getSourcesForDailyReport(report.id) };
}

type ReportRow = { report_date: string; report_sources: ReportSourceStatusRecord[] | null };
function buildReports(dates: string[], rows: ReportRow[], leadSources: LeadSource[]) { const byDate = new Map(rows.map((row) => [row.report_date, row.report_sources ?? []])); return dates.map((reportDate) => { const active = getActiveLeadSourcesAtDate(leadSources, reportDate); const sources = byDate.get(reportDate) ?? []; return { reportDate, sources, leadSources: active, status: getDailyCompletionStatus(sources, active) }; }); }

export async function getDashboardData(clientId: string, reportingStartedAt: string, monthStart: string, monthEnd: string, today: string): Promise<DashboardData> {
  const chargeableDates = getChargeableReportDates(monthStart, reportingStartedAt, today);
  const reportDates = [...new Set([...chargeableDates, today])];
  const supabase = await createClient();
  const [leadSources, totalsResult, reportsResult] = await Promise.all([
    getClientLeadSources(clientId),
    supabase.from("report_sources").select("leads_received, leads_answered, leads_interested, sales, revenue, daily_reports!inner(client_id, report_date)").eq("daily_reports.client_id", clientId).gte("daily_reports.report_date", monthStart).lt("daily_reports.report_date", monthEnd),
    supabase.from("daily_reports").select("report_date, report_sources(lead_source_id, status)").eq("client_id", clientId).in("report_date", reportDates),
  ]);
  if (totalsResult.error || reportsResult.error) throw new Error("Não foi possível carregar o resumo mensal.");
  const totals = emptyTotals();
  for (const row of (totalsResult.data ?? []) as Array<{ leads_received: number; leads_answered: number; leads_interested: number; sales: number; revenue: number | string }>) { totals.leadsReceived += row.leads_received; totals.leadsAnswered += row.leads_answered; totals.leadsInterested += row.leads_interested; totals.sales += row.sales; totals.revenue += Number(row.revenue); }
  const reportRows = (reportsResult.data as unknown as ReportRow[] ?? []);
  const reports = buildReports(chargeableDates, reportRows, leadSources);
  const todayReport = buildReports([today], reportRows, leadSources)[0];
  const reportableReports = reports.filter((report) => report.leadSources.length > 0);
  const pendingReports = reportableReports.filter((report) => hasPendingDailyReport(report.sources, report.leadSources));
  return { totals, todaySources: todayReport?.sources ?? [], todayLeadSources: todayReport?.leadSources ?? [], hasMonthlySources: (totalsResult.data ?? []).length > 0, pendingReports, reportingProgress: { completedDays: reportableReports.filter((report) => report.status === "FILLED").length, pendingDays: pendingReports.length, totalDays: reportableReports.length } };
}

export async function getHistoryData(clientId: string, reportingStartedAt: string, month: string, today: string): Promise<HistoryData> {
  const dates = getDatesForMonth(month, today);
  if (!dates.length) return { days: [], completeDays: 0, partialDays: 0, pendingDays: 0, hasRegisteredReports: false };
  const supabase = await createClient();
  const [leadSources, result] = await Promise.all([getClientLeadSources(clientId), supabase.from("daily_reports").select("report_date, report_sources(lead_source_id, status)").eq("client_id", clientId).gte("report_date", dates[dates.length - 1]).lte("report_date", dates[0])]);
  if (result.error) throw new Error("Não foi possível carregar o histórico de reportes.");
  const days = buildReports(dates, (result.data as unknown as ReportRow[] ?? []), leadSources)
    .map((day) => ({ ...day, isChargeable: isChargeableReportDate(day.reportDate, reportingStartedAt, today) }));
  return { days, completeDays: days.filter((day) => day.status === "FILLED").length, partialDays: days.filter((day) => day.status === "PARTIAL").length, pendingDays: days.filter((day) => day.isChargeable && hasPendingDailyReport(day.sources, day.leadSources)).length, hasRegisteredReports: (result.data ?? []).some((row) => ((row as unknown as ReportRow).report_sources ?? []).length > 0) };
}

export async function getPreviousDayPendingAlert(clientId: string, reportingStartedAt: string, today: string): Promise<PreviousDayPendingAlert | null> {
  const reportDate = getPreviousReportDate(today);
  if (!isChargeableReportDate(reportDate, reportingStartedAt, today)) return null;
  const dates = getChargeableReportDates(`${reportDate.slice(0, 7)}-01`, reportingStartedAt, today);
  const supabase = await createClient();
  const [leadSources, result] = await Promise.all([getClientLeadSources(clientId), supabase.from("daily_reports").select("report_date, report_sources(lead_source_id, status)").eq("client_id", clientId).in("report_date", dates)]);
  if (result.error) throw new Error("Não foi possível verificar as pendências do cliente.");
  const reports = buildReports(dates, (result.data as unknown as ReportRow[] ?? []), leadSources);
  const previous = reports.find((report) => report.reportDate === reportDate);
  if (!previous || !hasPendingDailyReport(previous.sources, previous.leadSources)) return null;
  return { reportDate, pendingSources: previous.leadSources.filter((source) => getReportSourceStatus(previous.sources, source.id) === "PENDING"), pendingDaysThisMonth: reports.filter((report) => hasPendingDailyReport(report.sources, report.leadSources)).length };
}

export function getReportSourceStatus(sources: readonly ReportSourceStatusRecord[], leadSourceId: string): ReportSourceStatus { return sources.find((source) => source.lead_source_id === leadSourceId)?.status ?? "PENDING"; }
export function getDailyCompletionStatus(sources: readonly ReportSourceStatusRecord[], leadSources: readonly LeadSource[]): DailyCompletionStatus { if (!leadSources.length || !sources.some((source) => leadSources.some((leadSource) => leadSource.id === source.lead_source_id && source.status !== "PENDING"))) return "PENDING"; return leadSources.every((leadSource) => getReportSourceStatus(sources, leadSource.id) !== "PENDING") ? "FILLED" : "PARTIAL"; }
/** Uma data sem origem vigente não é cobrável como pendência. */
export function hasPendingDailyReport(sources: readonly ReportSourceStatusRecord[], leadSources: readonly LeadSource[]) { return leadSources.length > 0 && getDailyCompletionStatus(sources, leadSources) !== "FILLED"; }
export const getTodayReportStatus = getDailyCompletionStatus;
export function getRates(totals: MonthlyTotals) { return { attendance: safeRate(totals.leadsAnswered, totals.leadsReceived), interest: safeRate(totals.leadsInterested, totals.leadsAnswered), conversion: safeRate(totals.sales, totals.leadsReceived), interestedConversion: safeRate(totals.sales, totals.leadsInterested), averageTicket: safeRate(totals.revenue, totals.sales) }; }
