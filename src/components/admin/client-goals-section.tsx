"use client";

import { useId, useState } from "react";
import { createClientGoal, updateClientGoal } from "@/app/(protected)/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLIENT_GOAL_METRICS, CLIENT_GOAL_METRIC_LABEL, isCurrencyGoalMetric } from "@/lib/goals/constants";
import type { ClientGoal } from "@/lib/goals/data.server";
import type { ClientGoalMetricType } from "@/types";

type ClientGoalsSectionProps = {
  clientId: string;
  goals: ClientGoal[];
};

export function ClientGoalsSection({ clientId, goals }: Readonly<ClientGoalsSectionProps>) {
  const formId = useId();
  const [metricType, setMetricType] = useState<ClientGoalMetricType>("REVENUE");

  return (
    <section className="space-y-3" aria-labelledby={`${formId}-title`}>
      <div>
        <h2 className="text-xl font-bold" id={`${formId}-title`}>Metas do cliente</h2>
        <p className="text-sm text-muted-foreground">Cadastre e mantenha as metas mensais usadas na visão analítica.</p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <h3 className="font-bold">Adicionar meta</h3>
          <form action={createClientGoal} className="mt-4 grid gap-4 sm:grid-cols-2">
            <input name="client-id" type="hidden" value={clientId} />
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`${formId}-name`}>Nome da meta</Label>
              <Input id={`${formId}-name`} className="min-h-11" maxLength={120} name="name" placeholder="Ex.: Meta de faturamento mensal" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-metric`}>Tipo da meta</Label>
              <select
                className="min-h-11 w-full rounded-md border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-metric`}
                name="metric-type"
                onChange={(event) => setMetricType(event.target.value as ClientGoalMetricType)}
                value={metricType}
              >
                {CLIENT_GOAL_METRICS.map((metric) => <option key={metric} value={metric}>{CLIENT_GOAL_METRIC_LABEL[metric]}</option>)}
              </select>
            </div>
            <GoalValueField id={`${formId}-value`} key={metricType} metricType={metricType} />
            <Button className="min-h-11 sm:col-span-2 sm:w-fit" type="submit">Adicionar meta</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {goals.map((goal) => <GoalCard goal={goal} key={goal.id} />)}
      </div>
      {!goals.length ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma meta cadastrada para este cliente.</p> : null}
    </section>
  );
}

function GoalValueField({ id, metricType, defaultValue }: Readonly<{ id: string; metricType: ClientGoalMetricType; defaultValue?: number }>) {
  const currency = isCurrencyGoalMetric(metricType);
  const formattedDefault = defaultValue === undefined
    ? undefined
    : currency
      ? defaultValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(defaultValue);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Valor da meta</Label>
      <div className="relative">
        {currency ? <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span> : null}
        <Input
          className={`min-h-11 ${currency ? "pl-10" : ""}`}
          defaultValue={formattedDefault}
          id={id}
          inputMode={currency ? "decimal" : "numeric"}
          min={currency ? undefined : 1}
          name="target-value"
          placeholder={currency ? "100.000,00" : "500"}
          required
          step={currency ? undefined : 1}
          type={currency ? "text" : "number"}
        />
      </div>
      <p className="text-xs text-muted-foreground">{currency ? "Valor mensal em reais." : "Quantidade mensal inteira."}</p>
    </div>
  );
}

function GoalCard({ goal }: Readonly<{ goal: ClientGoal }>) {
  const formId = useId();
  const formattedValue = isCurrencyGoalMetric(goal.metricType)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(goal.targetValue)
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(goal.targetValue);

  return (
    <Card className={goal.active ? "" : "bg-muted/30"}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-bold">{goal.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{CLIENT_GOAL_METRIC_LABEL[goal.metricType]}</p>
            <p className="mt-2 text-xl font-bold tracking-tight">{formattedValue}</p>
          </div>
          <Badge variant={goal.active ? "success" : "outline"}>{goal.active ? "Ativa" : "Inativa"}</Badge>
        </div>
        <form action={updateClientGoal} className="mt-4 space-y-4">
          <input name="client-id" type="hidden" value={goal.clientId} />
          <input name="goal-id" type="hidden" value={goal.id} />
          <div className="space-y-2">
            <Label htmlFor={`${formId}-name`}>Nome da meta</Label>
            <Input id={`${formId}-name`} className="min-h-11" defaultValue={goal.name} maxLength={120} name="name" required />
          </div>
          <GoalValueField id={`${formId}-value`} metricType={goal.metricType} defaultValue={goal.targetValue} />
          <Label className="flex min-h-11 items-center gap-2">
            <input defaultChecked={goal.active} name="active" type="checkbox" />
            Ativa
          </Label>
          <Button className="min-h-11 w-full" type="submit" variant="outline">Salvar meta</Button>
        </form>
      </CardContent>
    </Card>
  );
}
