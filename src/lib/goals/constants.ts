import type { ClientGoalMetricType } from "@/types";

export const CLIENT_GOAL_METRICS = ["REVENUE", "SALES", "AVERAGE_TICKET", "LEADS"] as const satisfies readonly ClientGoalMetricType[];

export const CLIENT_GOAL_METRIC_LABEL: Record<ClientGoalMetricType, string> = {
  REVENUE: "Faturamento",
  SALES: "Vendas",
  AVERAGE_TICKET: "Ticket médio",
  LEADS: "Leads recebidos",
};

export function isClientGoalMetricType(value: string): value is ClientGoalMetricType {
  return CLIENT_GOAL_METRICS.some((metric) => metric === value);
}

export function isCurrencyGoalMetric(metric: ClientGoalMetricType) {
  return metric === "REVENUE" || metric === "AVERAGE_TICKET";
}
