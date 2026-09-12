import type { PercentageVariation } from "@/lib/analytics/comparison";

export const formatInteger = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
export const formatCurrencyCents = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
export const formatRate = (value: number) => new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
export const formatDecimal = (value: number, maximumFractionDigits = 1) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value);

export function formatPercentageVariation(variation: PercentageVariation) {
  if (variation.kind === "new-result") return "Novo resultado";
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(variation.value);
}

export function formatPointVariation(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(value)} p.p.`;
}
