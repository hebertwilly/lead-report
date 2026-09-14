import Link from "next/link";
import { AnalyticsDashboard } from "@/components/admin/analytics/analytics-dashboard";
import { ClientSettings } from "@/components/admin/client-settings";
import { ReportChargeAction } from "@/components/admin/report-charge-action";
import { getAdminClientConfiguration, getAdminClientReportCharge } from "@/lib/admin/data.server";
import { getClientAnalyticsData, type AnalyticsSearchParams } from "@/lib/analytics/data.server";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppUrl } from "@/lib/config/app-url";
import { getClientGoals } from "@/lib/goals/data.server";
import { getTodayInSaoPaulo } from "@/lib/reports/date";
import { cn } from "@/lib/utils";

type Params = Promise<{ clientId: string }>;
type SearchParams = Promise<AnalyticsSearchParams & { view?: string; sucesso?: string; erro?: string }>;

export default async function ClientDetailPage({ params, searchParams }: Readonly<{ params: Params; searchParams: SearchParams }>) {
  await requireAdmin();
  const [{ clientId }, query] = await Promise.all([params, searchParams]);
  const view = query.view === "settings" ? "settings" : "analytics";
  const today = getTodayInSaoPaulo();
  const [result, reportCharge] = await Promise.all([
    view === "settings" ? loadSettings(clientId) : getClientAnalyticsData(clientId, query, today),
    getAdminClientReportCharge(clientId, today),
  ]);
  const client = result && "client" in result ? result.client : result?.configuration;

  if (!client) return <main className="p-6"><p>Cliente não encontrado.</p><Link className="text-primary" href="/admin/clientes">Voltar</Link></main>;

  return <main className="mx-auto max-w-7xl space-y-6 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <Link className="text-sm font-medium text-primary" href="/admin/clientes">← Clientes</Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{client.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Desempenho comercial e configurações do cliente</p>
      </div>
      {reportCharge ? <ReportChargeAction appUrl={getAppUrl()} pendingDates={reportCharge.pendingDates} whatsappPhone={reportCharge.whatsappPhone} /> : null}
    </header>
    <nav aria-label="Áreas do cliente" className="grid grid-cols-2 rounded-lg border bg-card p-1 sm:w-fit">
      <TabLink active={view === "analytics"} href={`/admin/clientes/${clientId}`}>Visão analítica</TabLink>
      <TabLink active={view === "settings"} href={`/admin/clientes/${clientId}?view=settings`}>Configurações</TabLink>
    </nav>
    {query.sucesso ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{query.sucesso}</p> : null}
    {query.erro ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{query.erro}</p> : null}
    {view === "analytics" && result && "current" in result ? <AnalyticsDashboard data={result} today={today} /> : null}
    {view === "settings" && result && "configuration" in result ? <ClientSettings client={result.configuration} goals={result.goals} /> : null}
  </main>;
}

async function loadSettings(clientId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) return null;
  const [configuration, goals] = await Promise.all([getAdminClientConfiguration(clientId), getClientGoals(clientId, true)]);
  return configuration ? { configuration, goals } : null;
}

function TabLink({ active, href, children }: Readonly<{ active: boolean; href: string; children: React.ReactNode }>) {
  return <Link aria-current={active ? "page" : undefined} className={cn("min-h-10 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")} href={href}>{children}</Link>;
}
