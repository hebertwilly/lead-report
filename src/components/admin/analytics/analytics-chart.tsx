"use client";

import { useId, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Label } from "@/components/ui/label";
import { formatCurrencyCents, formatInteger } from "@/lib/analytics/format";
import { formatShortReportDate } from "@/lib/reports/date";

type ChartMetric = "leads" | "sales" | "revenue";
type Point = { date: string; leads: number; sales: number; revenue: number };

const OPTIONS: Array<{ value: ChartMetric; label: string; color: string }> = [
  { value: "leads", label: "Leads", color: "hsl(221 83% 45%)" },
  { value: "sales", label: "Vendas", color: "hsl(160 84% 32%)" },
  { value: "revenue", label: "Faturamento", color: "hsl(25 95% 45%)" },
];

export function AnalyticsChart({ points }: Readonly<{ points: Point[] }>) {
  const id = useId();
  const [metric, setMetric] = useState<ChartMetric>("leads");
  const option = OPTIONS.find((item) => item.value === metric)!;
  const valueFormatter = (value: number) => metric === "revenue" ? formatCurrencyCents(value) : formatInteger(value);

  return (
    <div>
      <div className="mb-5 w-full space-y-2 sm:w-52">
        <Label htmlFor={id}>Métrica do gráfico</Label>
        <select id={id} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => setMetric(event.target.value as ChartMetric)} value={metric}>
          {OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <div className="h-72 w-full" role="img" aria-label={`Evolução diária de ${option.label.toLocaleLowerCase("pt-BR")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" minTickGap={24} tickFormatter={formatShortReportDate} tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tickFormatter={(value: number) => metric === "revenue" ? new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value / 100) : formatInteger(value)} tick={{ fontSize: 12 }} width={48} />
            <Tooltip labelFormatter={(label) => formatShortReportDate(String(label))} formatter={(value) => [valueFormatter(Number(value)), option.label]} />
            <Line connectNulls={false} dataKey={metric} dot={{ r: 3 }} activeDot={{ r: 5 }} stroke={option.color} strokeWidth={2.5} type="monotone" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">O gráfico inclui apenas dias com dados efetivamente reportados; dias pendentes não são convertidos em zero.</p>
    </div>
  );
}
