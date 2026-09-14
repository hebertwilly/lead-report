import "server-only";

import { getChargeableReportDates, getPendingStartDate } from "@/lib/reports/date";
import { getActiveLeadSourcesAtDate, getClientLeadSources, getDailyCompletionStatus, hasPendingDailyReport, type DailyCompletionStatus, type LeadSource, type ReportSourceStatusRecord } from "@/lib/reports/data.server";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClientRow = { id: string; name: string; slug: string; active: boolean; reporting_started_at: string; whatsapp_phone: string | null; profiles: Array<{ id: string; username: string; active: boolean; role: string }> | null };
type ReportRow = { client_id: string; report_date: string; report_sources: ReportSourceStatusRecord[] | null };
type SourceRow = { id: string; client_id: string; name: string; key: string; is_active: boolean; is_primary: boolean; sort_order: number; lead_source_active_periods: Array<{ active_from: string; inactive_from: string | null }> | null };
type MonthlyMetricRow = { sales: number; revenue: number | string; daily_reports: { client_id: string; report_date: string } | null };
type LastReportRow = { client_id: string; report_date: string };

export type AdminClientOverview = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  reportingStartedAt: string;
  username: string | null;
  accessActive: boolean;
  yesterdayStatus: DailyCompletionStatus;
  lastReportDate: string | null;
  pendingDays: number;
  pendingDaysThisMonth: number;
  oldestPendingDate: string | null;
  salesThisMonth: number;
  revenueThisMonth: number;
  leadSources: LeadSource[];
};

export type AdminDashboardData = {
  clients: AdminClientOverview[];
  activeClients: number;
  inactiveClients: number;
  clientsWithPendingReports: AdminClientOverview[];
};

export type AdminClientConfiguration = Pick<AdminClientOverview, "id" | "name" | "slug" | "active" | "reportingStartedAt" | "username" | "accessActive" | "leadSources"> & {
  whatsappPhone: string | null;
};

export type AdminClientReportCharge = {
  whatsappPhone: string | null;
  pendingDates: string[];
};

function mapSource(row: SourceRow): LeadSource {
  return { id: row.id, name: row.name, key: row.key, isActive: row.is_active, isPrimary: row.is_primary, sortOrder: row.sort_order, periods: row.lead_source_active_periods ?? [] };
}

/** Leitura pontual das configurações, sem carregar a visão dos demais clientes. */
export async function getAdminClientConfiguration(clientId: string): Promise<AdminClientConfiguration | null> {
  const supabase = await createClient();
  const [clientResult, sourcesResult] = await Promise.all([
    supabase.from("clients").select("id, name, slug, active, reporting_started_at, whatsapp_phone, profiles(id, username, active, role)").eq("id", clientId).maybeSingle(),
    supabase.from("lead_sources").select("id, client_id, name, key, is_active, is_primary, sort_order, lead_source_active_periods(active_from, inactive_from)").eq("client_id", clientId).order("sort_order").order("name"),
  ]);
  if (clientResult.error || sourcesResult.error) throw new Error("Não foi possível carregar as configurações do cliente.");
  if (!clientResult.data) return null;
  const client = clientResult.data as unknown as ClientRow;
  const profile = client.profiles?.find((item) => item.role === "CLIENT") ?? null;
  return {
    id: client.id,
    name: client.name,
    slug: client.slug,
    active: client.active,
    reportingStartedAt: client.reporting_started_at,
    username: profile?.username ?? null,
    accessActive: Boolean(profile?.active),
    whatsappPhone: client.whatsapp_phone,
    leadSources: (sourcesResult.data as unknown as SourceRow[] ?? []).map(mapSource),
  };
}

/** Pendências operacionais atuais, sem depender dos filtros da visão analítica. */
export async function getAdminClientReportCharge(clientId: string, today: string): Promise<AdminClientReportCharge | null> {
  if (!UUID_PATTERN.test(clientId)) return null;

  const supabase = await createClient();
  const clientResult = await supabase
    .from("clients")
    .select("reporting_started_at, whatsapp_phone")
    .eq("id", clientId)
    .maybeSingle();

  if (clientResult.error) throw new Error("Não foi possível carregar os dados de cobrança do cliente.");
  if (!clientResult.data) return null;

  const client = clientResult.data as { reporting_started_at: string; whatsapp_phone: string | null };
  const chargeableDates = getChargeableReportDates(
    getPendingStartDate(client.reporting_started_at),
    client.reporting_started_at,
    today,
  );
  if (!chargeableDates.length) return { whatsappPhone: client.whatsapp_phone, pendingDates: [] };

  const [leadSources, reportsResult] = await Promise.all([
    getClientLeadSources(clientId),
    supabase
      .from("daily_reports")
      .select("client_id, report_date, report_sources(lead_source_id, status)")
      .eq("client_id", clientId)
      .gte("report_date", chargeableDates[chargeableDates.length - 1])
      .lte("report_date", chargeableDates[0]),
  ]);
  if (reportsResult.error) throw new Error("Não foi possível verificar as pendências do cliente.");

  const reportsByDate = new Map(
    (reportsResult.data as unknown as ReportRow[] ?? []).map((report) => [report.report_date, report.report_sources ?? []]),
  );
  const pendingDates = chargeableDates
    .filter((date) => hasPendingDailyReport(reportsByDate.get(date) ?? [], getActiveLeadSourcesAtDate(leadSources, date)))
    .sort();

  return { whatsappPhone: client.whatsapp_phone, pendingDates };
}

export async function getAdminDashboardData(today: string): Promise<AdminDashboardData> {
  const supabase = await createClient();
  const clientsResult = await supabase.from("clients").select("id, name, slug, active, reporting_started_at, whatsapp_phone, profiles(id, username, active, role)").order("name");
  if (clientsResult.error) throw new Error("Não foi possível carregar os clientes.");

  const clientRows = (clientsResult.data as unknown as ClientRow[] ?? []);
  const earliestPendingStart = clientRows.map((client) => getPendingStartDate(client.reporting_started_at)).sort()[0];
  const currentMonthStart = `${today.slice(0, 7)}-01`;
  const [reportsResult, sourcesResult, monthlyMetricsResult, lastReportsResult] = await Promise.all([
    earliestPendingStart
      ? supabase.from("daily_reports").select("client_id, report_date, report_sources(lead_source_id, status)").gte("report_date", earliestPendingStart).lte("report_date", today).order("report_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("lead_sources").select("id, client_id, name, key, is_active, is_primary, sort_order, lead_source_active_periods(active_from, inactive_from)").order("sort_order").order("name"),
    supabase.from("report_sources").select("sales, revenue, daily_reports!inner(client_id, report_date)").gte("daily_reports.report_date", currentMonthStart).lte("daily_reports.report_date", today),
    supabase.from("daily_reports").select("client_id, report_date").order("report_date", { ascending: false }),
  ]);
  if (reportsResult.error || sourcesResult.error) throw new Error("Não foi possível carregar os reportes dos clientes.");

  if (monthlyMetricsResult.error) throw new Error("Não foi possível carregar os indicadores mensais dos clientes.");
  if (lastReportsResult.error) throw new Error("Não foi possível carregar o último reporte dos clientes.");

  const reportsByClient = new Map<string, Map<string, ReportSourceStatusRecord[]>>();
  for (const report of (reportsResult.data as unknown as ReportRow[] ?? [])) {
    const clientReports = reportsByClient.get(report.client_id) ?? new Map<string, ReportSourceStatusRecord[]>();
    clientReports.set(report.report_date, report.report_sources ?? []);
    reportsByClient.set(report.client_id, clientReports);
  }

  const sourceByClient = new Map<string, LeadSource[]>();
  for (const source of (sourcesResult.data as unknown as SourceRow[] ?? [])) {
    sourceByClient.set(source.client_id, [...(sourceByClient.get(source.client_id) ?? []), mapSource(source)]);
  }

  const monthlyTotalsByClient = new Map<string, { sales: number; revenue: number }>();
  for (const metric of (monthlyMetricsResult.data as unknown as MonthlyMetricRow[] ?? [])) {
    if (!metric.daily_reports) continue;
    const current = monthlyTotalsByClient.get(metric.daily_reports.client_id) ?? { sales: 0, revenue: 0 };
    current.sales += metric.sales;
    current.revenue += Number(metric.revenue);
    monthlyTotalsByClient.set(metric.daily_reports.client_id, current);
  }

  const lastReportByClient = new Map<string, string>();
  for (const report of (lastReportsResult.data as unknown as LastReportRow[] ?? [])) {
    if (!lastReportByClient.has(report.client_id)) lastReportByClient.set(report.client_id, report.report_date);
  }

  const clients = clientRows.map((client) => {
    const leadSources = sourceByClient.get(client.id) ?? [];
    const reports = reportsByClient.get(client.id) ?? new Map<string, ReportSourceStatusRecord[]>();
    const chargeableDates = getChargeableReportDates(getPendingStartDate(client.reporting_started_at), client.reporting_started_at, today);
    const pendingDates = chargeableDates.filter((date) => hasPendingDailyReport(reports.get(date) ?? [], getActiveLeadSourcesAtDate(leadSources, date)));
    const currentMonthDates = getChargeableReportDates(currentMonthStart, client.reporting_started_at, today);
    const pendingDaysThisMonth = currentMonthDates.filter((date) => hasPendingDailyReport(reports.get(date) ?? [], getActiveLeadSourcesAtDate(leadSources, date))).length;
    const yesterdayDate = chargeableDates[0] ?? null;
    const profile = client.profiles?.find((item) => item.role === "CLIENT") ?? null;
    const monthlyTotals = monthlyTotalsByClient.get(client.id) ?? { sales: 0, revenue: 0 };

    return {
      id: client.id,
      name: client.name,
      slug: client.slug,
      active: client.active,
      reportingStartedAt: client.reporting_started_at,
      username: profile?.username ?? null,
      accessActive: Boolean(profile?.active),
      yesterdayStatus: yesterdayDate ? getDailyCompletionStatus(reports.get(yesterdayDate) ?? [], getActiveLeadSourcesAtDate(leadSources, yesterdayDate)) : "PENDING",
      lastReportDate: lastReportByClient.get(client.id) ?? null,
      pendingDays: pendingDates.length,
      pendingDaysThisMonth,
      oldestPendingDate: pendingDates[pendingDates.length - 1] ?? null,
      salesThisMonth: monthlyTotals.sales,
      revenueThisMonth: monthlyTotals.revenue,
      leadSources,
    };
  });

  const clientsWithPendingReports = clients
    .filter((client) => client.pendingDays > 0)
    .sort((a, b) => b.pendingDays - a.pendingDays || (a.oldestPendingDate ?? "").localeCompare(b.oldestPendingDate ?? "") || a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));

  return {
    clients,
    activeClients: clients.filter((client) => client.active).length,
    inactiveClients: clients.filter((client) => !client.active).length,
    clientsWithPendingReports,
  };
}
