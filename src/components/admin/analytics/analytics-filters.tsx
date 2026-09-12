"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getQuickPeriods } from "@/lib/analytics/comparison";
import type { AnalyticsLeadSource, ComparisonMode, DateRange, PeriodPreset } from "@/lib/analytics/types";

const PERIOD_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last-7", label: "Últimos 7 dias" },
  { value: "last-15", label: "Últimos 15 dias" },
  { value: "last-30", label: "Últimos 30 dias" },
  { value: "current-month", label: "Este mês" },
  { value: "previous-month", label: "Mês passado" },
  { value: "custom", label: "Personalizado" },
];

const COMPARISON_OPTIONS: Array<{ value: ComparisonMode; label: string }> = [
  { value: "none", label: "Sem comparação" },
  { value: "previous-period", label: "Período anterior equivalente" },
  { value: "previous-month", label: "Mês anterior" },
  { value: "custom", label: "Personalizado" },
];

type Props = {
  today: string;
  period: DateRange;
  periodPreset: PeriodPreset;
  comparisonMode: ComparisonMode;
  comparisonPeriod: DateRange | null;
  sourceId: string | null;
  leadSources: AnalyticsLeadSource[];
};

export function AnalyticsFilters(props: Readonly<Props>) {
  const [period, setPeriod] = useState(props.period);
  const [preset, setPreset] = useState(props.periodPreset);
  const [comparison, setComparison] = useState(props.comparisonMode);
  const quickPeriods = getQuickPeriods(props.today);

  function changePreset(value: PeriodPreset) {
    setPreset(value);
    if (value !== "custom") setPeriod(quickPeriods[value]);
  }

  return (
    <form className="grid gap-4" method="get">
      <input name="view" type="hidden" value="analytics" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="analytics-period">Período</Label>
          <select id="analytics-period" className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => changePreset(event.target.value as PeriodPreset)} value={preset}>
            {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="analytics-source">Origem</Label>
          <select id="analytics-source" name="source" className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" defaultValue={props.sourceId ?? ""}>
            <option value="">Todas as origens</option>
            {props.leadSources.map((source) => <option key={source.id} value={source.id}>{source.name}{source.isActive ? "" : " (inativa)"}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="analytics-comparison">Comparar com</Label>
          <select id="analytics-comparison" name="compare" className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => setComparison(event.target.value as ComparisonMode)} value={comparison}>
            {COMPARISON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="analytics-from">Data inicial</Label>
          <Input id="analytics-from" max={props.today} name="from" onChange={(event) => { setPreset("custom"); setPeriod((current) => ({ ...current, from: event.target.value })); }} required type="date" value={period.from} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="analytics-to">Data final</Label>
          <Input id="analytics-to" max={props.today} min={period.from} name="to" onChange={(event) => { setPreset("custom"); setPeriod((current) => ({ ...current, to: event.target.value })); }} required type="date" value={period.to} />
        </div>
        {comparison === "custom" ? <>
          <div className="space-y-2">
            <Label htmlFor="comparison-from">Comparação inicial</Label>
            <Input defaultValue={props.comparisonPeriod?.from} id="comparison-from" max={props.today} name="comparisonFrom" required type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comparison-to">Comparação final</Label>
            <Input defaultValue={props.comparisonPeriod?.to} id="comparison-to" max={props.today} name="comparisonTo" required type="date" />
          </div>
        </> : null}
      </div>
      <Button className="min-h-11 w-full sm:w-fit" type="submit">Aplicar filtros</Button>
    </form>
  );
}
