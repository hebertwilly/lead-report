import { AlertTriangle, ArrowRight, Info, TrendingUp } from "lucide-react";
import { AnalyticsChart } from "@/components/admin/analytics/analytics-chart";
import { AnalyticsFilters } from "@/components/admin/analytics/analytics-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { percentagePointVariation, percentageVariation } from "@/lib/analytics/comparison";
import { formatCurrencyCents, formatInteger, formatPercentageVariation, formatPointVariation, formatRate } from "@/lib/analytics/format";
import type { AnalyticsMetrics, ClientAnalyticsData, DailyAnalytics, GoalProgress } from "@/lib/analytics/types";
import { formatReportDate } from "@/lib/reports/date";

type Props = { data: ClientAnalyticsData; today: string };

export function AnalyticsDashboard({ data, today }: Readonly<Props>) {
  const sourceName = data.leadSources.find((source) => source.id === data.filters.sourceId)?.name;
  const chartPoints = [...data.daily].reverse().filter((day) => day.hasReportedData).map((day) => ({
    date: day.date,
    leads: day.metrics.leadsReceived,
    sales: day.metrics.sales,
    revenue: day.metrics.revenueCents,
  }));

  return <div className="space-y-6">
    <Card><CardContent className="p-4 sm:p-5">
      <AnalyticsFilters
        comparisonMode={data.filters.comparisonMode}
        comparisonPeriod={data.filters.comparisonPeriod}
        leadSources={data.leadSources}
        period={data.filters.period}
        periodPreset={data.filters.periodPreset}
        sourceId={data.filters.sourceId}
        today={today}
      />
      <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
        Exibindo {formatReportDate(data.filters.period.from)} a {formatReportDate(data.filters.period.to)}
        {sourceName ? ` · Origem: ${sourceName}` : " · Todas as origens"}
        {data.filters.comparisonPeriod ? ` · Comparação: ${formatReportDate(data.filters.comparisonPeriod.from)} a ${formatReportDate(data.filters.comparisonPeriod.to)}` : ""}
      </p>
    </CardContent></Card>

    {data.filters.validationMessage ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{data.filters.validationMessage}</p> : null}
    {data.pendingDates.length ? <PendingAlert dates={data.pendingDates} /> : null}

    <section aria-labelledby="metricas-principais" className="space-y-3">
      <SectionHeading id="metricas-principais" title="Métricas principais" description="Resultados calculados somente com dados preenchidos no período." />
      {data.reportedDays === 0 ? <EmptyState>Nenhum reporte preenchido neste período.</EmptyState> : null}
      <MetricCards current={data.current} comparison={data.comparison} />
    </section>

    {data.insights.length ? <section aria-labelledby="resumo-executivo" className="space-y-3">
      <SectionHeading id="resumo-executivo" title="Resumo executivo" description="Leitura automática por regras determinísticas, sem IA externa." />
      <Card><CardContent className="p-4 sm:p-5"><ul className="grid gap-3 md:grid-cols-2">{data.insights.map((insight) => <li className="flex gap-3 text-sm leading-relaxed" key={insight}><TrendingUp aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{insight}</li>)}</ul></CardContent></Card>
    </section> : null}

    {data.goals ? <GoalSection goals={data.goals} sourceWarning={data.goalSourceWarning} /> : null}
    <Funnel metrics={data.current} />

    <section aria-labelledby="evolucao-temporal" className="space-y-3">
      <SectionHeading id="evolucao-temporal" title="Evolução temporal" description="Acompanhe uma métrica por dia dentro do período." />
      <Card><CardContent className="p-4 sm:p-5">{chartPoints.length ? <AnalyticsChart points={chartPoints} /> : <EmptyState>Nenhum dado reportado para exibir no gráfico.</EmptyState>}</CardContent></Card>
    </section>

    <SourcePerformance data={data} />
    <div className="grid gap-6 xl:grid-cols-2">
      <Objections data={data} />
      <Cities data={data} />
    </div>
    <DailyResults days={data.daily} />
  </div>;
}

function SectionHeading({ id, title, description }: Readonly<{ id: string; title: string; description?: string }>) {
  return <div><h2 className="text-xl font-bold tracking-tight" id={id}>{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>;
}

function EmptyState({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">{children}</p>;
}

function PendingAlert({ dates }: Readonly<{ dates: string[] }>) {
  return <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950" role="alert"><AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">Existem {dates.length} {dates.length === 1 ? "dia com reporte pendente" : "dias com reportes pendentes"} neste período.</p><p className="mt-1 text-sm">Os resultados podem estar incompletos. Pendência mais antiga: {formatReportDate(dates[0])}.</p></div></div>;
}

type MetricCardDefinition = {
  label: string;
  value: (metrics: AnalyticsMetrics) => number;
  format: (value: number) => string;
  variation: "percent" | "points";
};

const METRIC_CARDS: MetricCardDefinition[] = [
  { label: "Leads recebidos", value: (metrics) => metrics.leadsReceived, format: formatInteger, variation: "percent" },
  { label: "Leads respondidos", value: (metrics) => metrics.leadsAnswered, format: formatInteger, variation: "percent" },
  { label: "Leads interessados", value: (metrics) => metrics.leadsInterested, format: formatInteger, variation: "percent" },
  { label: "Vendas", value: (metrics) => metrics.sales, format: formatInteger, variation: "percent" },
  { label: "Faturamento", value: (metrics) => metrics.revenueCents, format: formatCurrencyCents, variation: "percent" },
  { label: "Ticket médio", value: (metrics) => metrics.averageTicketCents, format: formatCurrencyCents, variation: "percent" },
  { label: "Taxa de atendimento", value: (metrics) => metrics.attendance, format: formatRate, variation: "points" },
  { label: "Taxa de interesse", value: (metrics) => metrics.interest, format: formatRate, variation: "points" },
  { label: "Taxa de conversão geral", value: (metrics) => metrics.conversion, format: formatRate, variation: "points" },
  { label: "Conversão dos interessados", value: (metrics) => metrics.interestedConversion, format: formatRate, variation: "points" },
];

function MetricCards({ current, comparison }: Readonly<{ current: AnalyticsMetrics; comparison: AnalyticsMetrics | null }>) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">{METRIC_CARDS.map((metric) => {
    const currentValue = metric.value(current);
    const previousValue = comparison ? metric.value(comparison) : null;
    const variation = previousValue === null ? null : metric.variation === "points"
      ? formatPointVariation(percentagePointVariation(currentValue, previousValue))
      : formatPercentageVariation(percentageVariation(currentValue, previousValue));
    return <Card key={metric.label}><CardContent className="p-4"><p className="min-h-10 text-sm text-muted-foreground">{metric.label}</p><p className="mt-2 break-words text-xl font-bold tracking-tight sm:text-2xl">{metric.format(currentValue)}</p>{previousValue !== null ? <div className="mt-3 border-t pt-3 text-xs"><p className="text-muted-foreground">vs {metric.format(previousValue)}</p><p className="mt-1 font-semibold text-foreground">{variation}</p></div> : null}</CardContent></Card>;
  })}</div>;
}

const GOAL_STATUS: Record<GoalProgress["status"], string> = {
  ABOVE_PACE: "Acima do ritmo necessário",
  ON_PACE: "Dentro do ritmo",
  BELOW_PACE: "Abaixo do ritmo",
  ACHIEVED: "Meta atingida",
};

function GoalSection({ goals, sourceWarning }: Readonly<{ goals: GoalProgress[]; sourceWarning: boolean }>) {
  return <section aria-labelledby="acompanhamento-metas" className="space-y-3">
    <SectionHeading id="acompanhamento-metas" title="Acompanhamento de metas" description="Realizado do mês atual até hoje e projeção linear pelo ritmo realizado." />
    {sourceWarning ? <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />As metas são gerais do cliente. Como uma origem está filtrada, o realizado abaixo representa somente esse recorte e não o progresso global.</div> : null}
    {!goals.length ? <EmptyState>Este cliente ainda não possui metas configuradas.</EmptyState> : <div className="grid gap-4 md:grid-cols-2">{goals.map((goal) => <GoalCard goal={goal} key={goal.goal.id} />)}</div>}
  </section>;
}

function GoalCard({ goal }: Readonly<{ goal: GoalProgress }>) {
  const format = goal.isCurrency ? formatCurrencyCents : formatInteger;
  const progress = Math.min(Math.max(goal.achievement * 100, 0), 100);
  const difference = goal.realized - goal.target;
  const statusLabel = goal.isAverageTicket
    ? goal.status === "ACHIEVED" ? "Meta atingida" : goal.status === "ON_PACE" ? "Próximo da meta" : "Abaixo da meta"
    : GOAL_STATUS[goal.status];
  return <Card><CardContent className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm text-muted-foreground">{goal.goal.name}</p><p className="mt-1 text-xl font-bold">{format(goal.realized)} <span className="text-sm font-normal text-muted-foreground">de {format(goal.target)}</span></p></div><Badge variant={goal.status === "ACHIEVED" || goal.status === "ABOVE_PACE" ? "success" : "outline"}>{statusLabel}</Badge></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-sm font-medium">{formatRate(goal.achievement)} atingido</p>{goal.isAverageTicket ? <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm"><div><dt className="text-muted-foreground">Diferença</dt><dd className="mt-1 font-semibold">{difference > 0 ? "+" : difference < 0 ? "−" : ""}{format(Math.abs(difference))}</dd></div><div><dt className="text-muted-foreground">Percentual da meta</dt><dd className="mt-1 font-semibold">{formatRate(goal.achievement)}</dd></div></dl> : <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm"><div><dt className="text-muted-foreground">Falta</dt><dd className="mt-1 font-semibold">{format(goal.remaining)}</dd></div><div><dt className="text-muted-foreground">Projeção pelo ritmo atual</dt><dd className="mt-1 font-semibold">{format(Math.round(goal.projection ?? 0))}</dd></div><div><dt className="text-muted-foreground">Dias restantes</dt><dd className="mt-1 font-semibold">{goal.remainingDays}</dd></div><div><dt className="text-muted-foreground">Necessário por dia</dt><dd className="mt-1 font-semibold">{goal.requiredPerDay === null ? "—" : format(Math.ceil(goal.requiredPerDay))}</dd></div></dl>}</CardContent></Card>;
}

function Funnel({ metrics }: Readonly<{ metrics: AnalyticsMetrics }>) {
  const stages = [
    { label: "Leads recebidos", value: metrics.leadsReceived, rate: null },
    { label: "Respondidos", value: metrics.leadsAnswered, rate: metrics.attendance, detail: "dos leads" },
    { label: "Interessados", value: metrics.leadsInterested, rate: metrics.interest, detail: "dos respondidos" },
    { label: "Vendas", value: metrics.sales, rate: metrics.interestedConversion, detail: "dos interessados" },
  ];
  return <section aria-labelledby="funil-comercial" className="space-y-3"><SectionHeading id="funil-comercial" title="Funil comercial" description={`Conversão geral: ${formatInteger(metrics.sales)} / ${formatInteger(metrics.leadsReceived)} (${formatRate(metrics.conversion)}).`} /><Card><CardContent className="grid gap-3 p-4 sm:p-5 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">{stages.map((stage, index) => <div className="contents" key={stage.label}><div className="rounded-lg border bg-muted/30 p-4 text-center"><p className="text-sm text-muted-foreground">{stage.label}</p><p className="mt-1 text-2xl font-bold">{formatInteger(stage.value)}</p>{stage.rate !== null ? <p className="mt-1 text-xs text-muted-foreground">{formatRate(stage.rate)} {stage.detail}</p> : null}</div>{index < stages.length - 1 ? <ArrowRight aria-hidden="true" className="mx-auto size-5 rotate-90 text-muted-foreground md:rotate-0" /> : null}</div>)}</CardContent></Card></section>;
}

function SourcePerformance({ data }: Readonly<{ data: ClientAnalyticsData }>) {
  return <section aria-labelledby="desempenho-origem" className="space-y-3"><SectionHeading id="desempenho-origem" title="Desempenho por origem" description="Origens históricas aparecem quando possuem dados no período." />{!data.bySource.length ? <EmptyState>Nenhuma origem possui dados reportados neste período.</EmptyState> : <Card><CardContent className="p-0"><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/40 text-muted-foreground"><tr>{["Origem", "Leads", "Respondidos", "Interessados", "Vendas", "Faturamento", "Conversão", "Ticket médio"].map((label) => <th className="whitespace-nowrap px-4 py-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{data.bySource.map((source) => <tr className="border-b last:border-0" key={source.sourceId}><td className="px-4 py-3 font-semibold">{source.sourceName}</td><td className="px-4 py-3">{formatInteger(source.metrics.leadsReceived)}</td><td className="px-4 py-3">{formatInteger(source.metrics.leadsAnswered)}</td><td className="px-4 py-3">{formatInteger(source.metrics.leadsInterested)}</td><td className="px-4 py-3">{formatInteger(source.metrics.sales)}</td><td className="whitespace-nowrap px-4 py-3">{formatCurrencyCents(source.metrics.revenueCents)}</td><td className="px-4 py-3">{formatRate(source.metrics.conversion)}</td><td className="whitespace-nowrap px-4 py-3">{formatCurrencyCents(source.metrics.averageTicketCents)}</td></tr>)}</tbody></table></div><div className="divide-y md:hidden">{data.bySource.map((source) => <article className="p-4" key={source.sourceId}><h3 className="font-bold">{source.sourceName}</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><Data label="Leads" value={formatInteger(source.metrics.leadsReceived)} /><Data label="Respondidos" value={formatInteger(source.metrics.leadsAnswered)} /><Data label="Interessados" value={formatInteger(source.metrics.leadsInterested)} /><Data label="Vendas" value={formatInteger(source.metrics.sales)} /><Data label="Faturamento" value={formatCurrencyCents(source.metrics.revenueCents)} /><Data label="Conversão" value={formatRate(source.metrics.conversion)} /><Data label="Ticket médio" value={formatCurrencyCents(source.metrics.averageTicketCents)} /></dl></article>)}</div></CardContent></Card>}</section>;
}

function Objections({ data }: Readonly<{ data: ClientAnalyticsData }>) {
  return <section aria-labelledby="objecoes" className="space-y-3"><SectionHeading id="objecoes" title="Principais motivos de não conversão" description="Participação entre as objeções registradas; um lead pode ter mais de uma objeção." />{!data.objections.length ? <EmptyState>Nenhuma objeção registrada.</EmptyState> : <Card><CardContent className="divide-y p-4 sm:p-5">{data.objections.map((item) => <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0" key={item.type}><div><p className="font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{formatRate(item.share)} das objeções</p></div><p className="text-xl font-bold">{formatInteger(item.quantity)}</p></div>)}</CardContent></Card>}</section>;
}

function Cities({ data }: Readonly<{ data: ClientAnalyticsData }>) {
  return <section aria-labelledby="cidades" className="space-y-3"><SectionHeading id="cidades" title="Distribuição de vendas por cidade" description="Participação nos envios registrados; nem toda venda possui cidade informada." />{!data.cities.length ? <EmptyState>Nenhuma cidade de envio registrada.</EmptyState> : <Card><CardContent className="divide-y p-4 sm:p-5">{data.cities.map((item) => <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0" key={`${item.city}-${item.state}`}><div><p className="font-medium">{item.city}/{item.state}</p><p className="text-xs text-muted-foreground">{formatRate(item.share)} dos envios</p></div><p className="text-xl font-bold">{formatInteger(item.quantity)}</p></div>)}</CardContent></Card>}</section>;
}

const DAY_STATUS: Record<DailyAnalytics["status"], string> = { FILLED: "Preenchido", PARTIAL: "Parcial", PENDING: "Pendente", NOT_REQUIRED: "Não cobrado" };

function DailyResults({ days }: Readonly<{ days: DailyAnalytics[] }>) {
  return <section aria-labelledby="resultados-diarios" className="space-y-3"><SectionHeading id="resultados-diarios" title="Resultados diários" description="Mais recentes primeiro. Traços indicam ausência de dados, não resultado zero." /><Card><CardContent className="p-0"><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/40 text-muted-foreground"><tr>{["Data", "Leads", "Interessados", "Vendas", "Faturamento", "Conversão", "Status"].map((label) => <th className="whitespace-nowrap px-4 py-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{days.map((day) => <tr className="border-b last:border-0" key={day.date}><td className="whitespace-nowrap px-4 py-3 font-semibold">{formatReportDate(day.date)}</td><DailyCells day={day} /><td className="px-4 py-3"><StatusBadge status={day.status} /></td></tr>)}</tbody></table></div><div className="divide-y md:hidden">{days.map((day) => <article className="p-4" key={day.date}><div className="flex items-center justify-between gap-3"><h3 className="font-bold">{formatReportDate(day.date)}</h3><StatusBadge status={day.status} /></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><Data label="Leads" value={day.hasReportedData ? formatInteger(day.metrics.leadsReceived) : "—"} /><Data label="Interessados" value={day.hasReportedData ? formatInteger(day.metrics.leadsInterested) : "—"} /><Data label="Vendas" value={day.hasReportedData ? formatInteger(day.metrics.sales) : "—"} /><Data label="Faturamento" value={day.hasReportedData ? formatCurrencyCents(day.metrics.revenueCents) : "—"} /><Data label="Conversão" value={day.hasReportedData ? formatRate(day.metrics.conversion) : "—"} /></dl></article>)}</div>{!days.length ? <div className="p-4"><EmptyState>Nenhuma data disponível neste período.</EmptyState></div> : null}</CardContent></Card></section>;
}

function DailyCells({ day }: Readonly<{ day: DailyAnalytics }>) {
  if (!day.hasReportedData) return <><td className="px-4 py-3">—</td><td className="px-4 py-3">—</td><td className="px-4 py-3">—</td><td className="px-4 py-3">—</td><td className="px-4 py-3">—</td></>;
  return <><td className="px-4 py-3">{formatInteger(day.metrics.leadsReceived)}</td><td className="px-4 py-3">{formatInteger(day.metrics.leadsInterested)}</td><td className="px-4 py-3">{formatInteger(day.metrics.sales)}</td><td className="whitespace-nowrap px-4 py-3">{formatCurrencyCents(day.metrics.revenueCents)}</td><td className="px-4 py-3">{formatRate(day.metrics.conversion)}</td></>;
}

function StatusBadge({ status }: Readonly<{ status: DailyAnalytics["status"] }>) {
  return <Badge className={status === "PENDING" ? "border-amber-200 bg-amber-50 text-amber-800" : status === "PARTIAL" ? "border-blue-200 bg-blue-50 text-blue-800" : ""} variant={status === "FILLED" ? "success" : "outline"}>{DAY_STATUS[status]}</Badge>;
}

function Data({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>;
}
