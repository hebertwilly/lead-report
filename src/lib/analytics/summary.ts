import type { AnalyticsMetrics, GoalProgress, ObjectionAnalytics, SourceAnalytics } from "@/lib/analytics/types";
import { percentagePointVariation, percentageVariation } from "@/lib/analytics/comparison";

const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

type SummaryInput = {
  current: AnalyticsMetrics;
  comparison: AnalyticsMetrics | null;
  sources: SourceAnalytics[];
  objections: ObjectionAnalytics[];
  goals: GoalProgress[] | null;
  pendingDays: number;
};

export function buildExecutiveInsights(input: SummaryInput) {
  const insights: string[] = [];

  if (input.comparison) {
    const revenue = percentageVariation(input.current.revenueCents, input.comparison.revenueCents);
    if (revenue.kind === "value" && Math.abs(revenue.value) >= 0.005) {
      insights.push(`O faturamento ${revenue.value > 0 ? "cresceu" : "caiu"} ${percent.format(Math.abs(revenue.value))} em relação ao período comparado.`);
    } else if (revenue.kind === "new-result") {
      insights.push("Houve faturamento no período atual, sem base de faturamento no período comparado.");
    }

    const conversion = percentagePointVariation(input.current.conversion, input.comparison.conversion);
    if (Math.abs(conversion) >= 0.05) {
      insights.push(`A taxa de conversão ${conversion > 0 ? "subiu" : "caiu"} ${number.format(Math.abs(conversion))} p.p. em relação ao período comparado.`);
    }
  }

  const topSource = [...input.sources].sort((a, b) => b.metrics.sales - a.metrics.sales)[0];
  if (topSource && input.current.sales > 0 && topSource.metrics.sales > 0) {
    insights.push(`${topSource.sourceName} concentrou ${percent.format(topSource.metrics.sales / input.current.sales)} das vendas registradas.`);
  }

  const topObjection = input.objections[0];
  if (topObjection?.quantity) insights.push(`${topObjection.label} foi o motivo de não conversão mais registrado no período.`);

  const revenueGoal = input.goals?.find((goal) => goal.goal.metricType === "REVENUE");
  if (revenueGoal) {
    const status = revenueGoal.status === "ACHIEVED" ? "atingida" : revenueGoal.status === "ABOVE_PACE" ? "acima do ritmo necessário" : revenueGoal.status === "ON_PACE" ? "dentro do ritmo" : "abaixo do ritmo necessário";
    insights.push(`A meta de faturamento está ${status}.`);
  }

  if (input.pendingDays > 0) insights.push(`Existem ${input.pendingDays} ${input.pendingDays === 1 ? "dia pendente" : "dias pendentes"} de reporte no período.`);
  return insights.slice(0, 6);
}
