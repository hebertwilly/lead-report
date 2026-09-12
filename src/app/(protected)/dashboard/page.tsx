import Link from "next/link";
import { Check, Circle, ClipboardPlus, Minus } from "lucide-react";
import { ClientPageHeader } from "@/components/layout/client-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireClient } from "@/lib/auth/guards";
import { SOURCE_STATUS_LABEL } from "@/lib/reports/constants";
import { formatCurrency, formatMonth, formatPercentage, formatReportDate, formatShortReportDate, getTodayInSaoPaulo } from "@/lib/reports/date";
import { getDashboardData, getRates, getReportSourceStatus, getTodayReportStatus, type DailyCompletionStatus, type PendingReport, type ReportingProgress } from "@/lib/reports/data.server";
import type { ReportSourceStatus } from "@/types";

const statusDetails: Record<DailyCompletionStatus, { label: string; description: string; variant: "outline" | "default" | "success" }> = {
  PENDING: { label: "Pendente", description: "Nenhuma origem foi registrada hoje.", variant: "outline" },
  PARTIAL: { label: "Parcial", description: "Algumas origens ainda não foram atualizadas hoje.", variant: "default" },
  FILLED: { label: "Preenchido", description: "Todas as origens foram atualizadas hoje.", variant: "success" },
};

export default async function DashboardPage() {
  const profile = await requireClient();
  const today = getTodayInSaoPaulo();
  const month = today.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = new Date(year, monthNumber, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const data = await getDashboardData(profile.clientId!, profile.client!.reportingStartedAt, `${month}-01`, monthEnd, today);
  const rates = getRates(data.totals);
  const todayStatus = getTodayReportStatus(data.todaySources, data.todayLeadSources);
  const status = statusDetails[todayStatus];
  const reportHref = `/reportes?data=${today}`;

  return <div><ClientPageHeader activePage="dashboard" clientName={profile.client!.name} /><div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <section className="flex flex-col gap-4 rounded-2xl bg-primary px-5 py-6 text-primary-foreground shadow-lg sm:px-7 sm:py-8 lg:flex-row lg:items-end lg:justify-between"><div className="space-y-2"><p className="text-sm font-medium text-primary-foreground/75">Home operacional</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{profile.client!.name}</h1><p className="capitalize text-primary-foreground/80">{formatMonth(month)}</p></div><div className="flex flex-col gap-3 rounded-xl bg-white/10 p-4 sm:flex-row sm:items-center"><div><p className="text-sm text-primary-foreground/80">Reporte de hoje — {formatReportDate(today)}</p><div className="mt-1 flex items-center gap-2"><Badge variant={status.variant} className={todayStatus === "PENDING" ? "border-primary-foreground/40 bg-transparent text-primary-foreground" : ""}>{status.label}</Badge><span className="text-sm">{status.description}</span></div><p className="mt-2 max-w-sm text-xs leading-relaxed text-primary-foreground/70">Preencha os dados de hoje após o encerramento do dia ou no dia seguinte.</p></div><Button asChild className="h-11 shrink-0 bg-white text-primary hover:bg-white/90"><Link href={reportHref}><ClipboardPlus aria-hidden="true" className="mr-2 size-4" />{todayStatus === "PENDING" ? "Preencher reporte de hoje" : "Continuar reporte de hoje"}</Link></Button></div></section>
    <section aria-labelledby="resumo-mensal" className="space-y-3"><div><h2 id="resumo-mensal" className="text-xl font-bold">Resumo do mês</h2><p className="text-sm text-muted-foreground">Resultados acumulados de {formatMonth(month)}.</p></div>{!data.hasMonthlySources ? <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">Ainda não há reportes preenchidos neste mês. Comece pelo reporte de hoje.</p> : null}<div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7"><Metric label="Leads recebidos" value={data.totals.leadsReceived.toString()} /><Metric label="Leads respondidos" value={data.totals.leadsAnswered.toString()} /><Metric label="Leads interessados" value={data.totals.leadsInterested.toString()} /><Metric label="Vendas" value={data.totals.sales.toString()} /><Metric label="Conversão geral" value={formatPercentage(rates.conversion)} /><Metric label="Faturamento" value={formatCurrency(data.totals.revenue)} /><Metric label="Ticket médio" value={formatCurrency(rates.averageTicket)} /></div></section>
    <section aria-labelledby="reportes-mes" className="space-y-4"><div><h2 id="reportes-mes" className="text-xl font-bold">Reportes do mês</h2><p className="mt-1 text-sm text-muted-foreground">{data.reportingProgress.completedDays} de {data.reportingProgress.totalDays} dias preenchidos</p><p className="text-sm font-medium text-muted-foreground">{data.reportingProgress.pendingDays === 1 ? "Falta 1 reporte" : `Faltam ${data.reportingProgress.pendingDays} reportes`}</p></div><ReportingProgress progress={data.reportingProgress} />{data.pendingReports.length === 0 ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="font-semibold text-emerald-950">Reportes em dia</h3><p className="mt-1 text-sm text-emerald-900">Todos os reportes cobrados até ontem foram preenchidos.</p></div> : <PendingReportCarousel pendingReports={data.pendingReports} today={today} />}</section>
  </div></div>;
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) { return <Card><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 break-words text-xl font-bold tracking-tight">{value}</p></CardContent></Card>; }

function ReportingProgress({ progress }: Readonly<{ progress: ReportingProgress }>) {
  const percentage = progress.totalDays === 0 ? 0 : (progress.completedDays / progress.totalDays) * 100;
  return <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progresso de preenchimento dos reportes" aria-valuemax={progress.totalDays} aria-valuemin={0} aria-valuenow={progress.completedDays}><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} /></div>;
}

function PendingReportCarousel({ pendingReports, today }: Readonly<{ pendingReports: PendingReport[]; today: string }>) {
  return <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"><span className="sr-only">Deslize horizontalmente para ver os demais reportes pendentes.</span>{pendingReports.map((report) => <PendingReportCard key={report.reportDate} report={report} isToday={report.reportDate === today} />)}</div>;
}

function PendingReportCard({ report, isToday }: Readonly<{ report: PendingReport; isToday: boolean }>) {
  const pendingCount = report.leadSources.filter((source) => getReportSourceStatus(report.sources, source.id) === "PENDING").length;

  return <Card className="w-[calc(100vw-3rem)] shrink-0 snap-start sm:w-72 lg:w-80"><CardContent className="space-y-4 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold tracking-tight">{formatShortReportDate(report.reportDate)}</h3><p className="mt-1 text-sm text-muted-foreground">{pendingCount} de {report.leadSources.length} origens pendentes</p></div>{isToday ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Hoje</span> : null}</div><ul className="space-y-2" aria-label={`Status das origens de ${formatShortReportDate(report.reportDate)}`}>{report.leadSources.map((source) => <SourceStatus key={source.id} label={source.name} status={getReportSourceStatus(report.sources, source.id)} />)}</ul><Button asChild className="min-h-11 w-full"><Link href={`/reportes?data=${report.reportDate}`}><ClipboardPlus aria-hidden="true" className="mr-2 size-4" />Preencher</Link></Button></CardContent></Card>;
}

function SourceStatus({ label, status }: Readonly<{ label: string; status: ReportSourceStatus }>) {
  const Icon = status === "FILLED" ? Check : status === "NO_CONTACTS" ? Minus : Circle;
  const iconClassName = status === "FILLED" ? "text-emerald-600" : status === "NO_CONTACTS" ? "text-muted-foreground" : "text-amber-500";
  return <li className="flex items-center gap-2 text-sm"><Icon aria-hidden="true" className={`size-4 shrink-0 ${iconClassName}`} /><span>{label}</span><span className="sr-only">: {SOURCE_STATUS_LABEL[status]}</span></li>;
}
