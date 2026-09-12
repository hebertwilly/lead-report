import Link from "next/link";
import { CalendarDays, CheckCircle2, CircleDashed, Clock3 } from "lucide-react";
import { HistoryPeriodFilter } from "@/components/history/history-period-filter";
import { ClientPageHeader } from "@/components/layout/client-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireClient } from "@/lib/auth/guards";
import { SOURCE_STATUS_LABEL } from "@/lib/reports/constants";
import { formatMonth, formatReportDate, getTodayInSaoPaulo } from "@/lib/reports/date";
import { getHistoryData, getReportSourceStatus, type DailyCompletionStatus, type HistoryDay } from "@/lib/reports/data.server";

type SearchParams = Promise<{ mes?: string | string[]; ano?: string | string[] }>;

const statusDetails: Record<DailyCompletionStatus, { label: string; badgeVariant: "outline" | "default" | "success"; icon: typeof Clock3 }> = {
  PENDING: { label: "Pendente", badgeVariant: "outline", icon: Clock3 },
  PARTIAL: { label: "Parcial", badgeVariant: "default", icon: CircleDashed },
  FILLED: { label: "Completo", badgeVariant: "success", icon: CheckCircle2 },
};

export default async function HistoryPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  const profile = await requireClient();
  const parameters = await searchParams;
  const today = getTodayInSaoPaulo();
  const period = getHistoryPeriod(parameters, today);
  const history = await getHistoryData(profile.clientId!, profile.client!.reportingStartedAt, period.value, today);

  return <div><ClientPageHeader activePage="historico" clientName={profile.client!.name} /><main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight">Histórico de reportes</h1><p className="mt-1 text-sm text-muted-foreground">Consulte períodos anteriores e abra uma data para editar seu reporte.</p></div><HistoryPeriodFilter currentMonth={today.slice(5, 7)} currentYear={today.slice(0, 4)} month={period.month} year={period.year} /></section><section aria-labelledby="history-summary" className="rounded-xl border bg-card p-4 sm:p-5"><h2 id="history-summary" className="capitalize text-lg font-bold">{formatMonth(period.value)}</h2><div className="mt-4 grid grid-cols-3 gap-3"><SummaryItem label="completos" value={history.completeDays} /><SummaryItem label="pendentes" value={history.pendingDays} /><SummaryItem label="parciais" value={history.partialDays} /></div></section>{!history.hasRegisteredReports ? <section className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground"><h2 className="font-semibold text-foreground">Nenhum reporte registrado neste período.</h2><p className="mt-1">As datas abaixo continuam disponíveis para preenchimento.</p></section> : null}<section aria-labelledby="history-list" className="space-y-3"><div><h2 id="history-list" className="text-xl font-bold">Datas do período</h2><p className="mt-1 text-sm text-muted-foreground">As datas mais recentes aparecem primeiro.</p></div><div className="space-y-3">{history.days.map((day) => <HistoryDayCard key={day.reportDate} day={day} />)}</div></section></main></div>;
}

function SummaryItem({ label, value }: Readonly<{ label: string; value: number }>) { return <div className="rounded-lg bg-muted p-3"><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>; }

function HistoryDayCard({ day }: Readonly<{ day: HistoryDay }>) {
  const details = statusDetails[day.status];
  const Icon = details.icon;
  const availableForRetroactiveEntry = !day.isChargeable && day.status === "PENDING";
  const noActiveSources = day.leadSources.length === 0;

  return <Card><CardContent className="p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{formatReportDate(day.reportDate)}</h3>{noActiveSources ? <Badge variant="secondary">Sem origem vigente</Badge> : availableForRetroactiveEntry ? <Badge variant="secondary">Disponível para preenchimento</Badge> : <Badge variant={details.badgeVariant}><Icon aria-hidden="true" className="mr-1 size-3.5" />{details.label}</Badge>}</div><dl className="mt-4 space-y-2">{day.leadSources.map((source) => { const status = getReportSourceStatus(day.sources, source.id); return <div key={source.id} className="flex items-center justify-between gap-3 text-sm"><dt className="text-muted-foreground">{source.name}</dt><dd><Badge variant={status === "FILLED" ? "success" : status === "NO_CONTACTS" ? "secondary" : "outline"}>{SOURCE_STATUS_LABEL[status]}</Badge></dd></div>; })}</dl></div><Button asChild className="min-h-11 shrink-0 sm:self-center"><Link href={`/reportes?data=${day.reportDate}`}><CalendarDays aria-hidden="true" className="mr-2 size-4" />Abrir reporte</Link></Button></div></CardContent></Card>;
}

function getHistoryPeriod(parameters: Awaited<SearchParams>, today: string) {
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const requestedYear = typeof parameters.ano === "string" && /^\d{4}$/.test(parameters.ano) ? Number(parameters.ano) : currentYear;
  const requestedMonth = typeof parameters.mes === "string" && /^\d{1,2}$/.test(parameters.mes) ? Number(parameters.mes) : currentMonth;
  const isValidMonth = requestedMonth >= 1 && requestedMonth <= 12;
  const isValidYear = requestedYear >= 2020 && requestedYear <= currentYear;
  const isFuturePeriod = requestedYear > currentYear || (requestedYear === currentYear && requestedMonth > currentMonth);
  const year = !isValidYear || isFuturePeriod ? currentYear : requestedYear;
  const month = !isValidMonth || !isValidYear || isFuturePeriod ? currentMonth : requestedMonth;
  const paddedMonth = String(month).padStart(2, "0");
  return { year: String(year), month: paddedMonth, value: `${year}-${paddedMonth}` };
}
