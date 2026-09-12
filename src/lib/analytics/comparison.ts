import type { ComparisonMode, DateRange, PeriodPreset } from "@/lib/analytics/types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toUtcDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function fromUtcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function isValidAnalyticsDate(value: string, today: string) {
  if (!DATE_PATTERN.test(value) || value > today) return false;
  const parsed = toUtcDate(value);
  return !Number.isNaN(parsed.getTime()) && fromUtcDate(parsed) === value;
}

export function addDays(value: string, amount: number) {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return fromUtcDate(date);
}

export function inclusiveDays(range: DateRange) {
  return Math.round((toUtcDate(range.to).getTime() - toUtcDate(range.from).getTime()) / 86_400_000) + 1;
}

export function getDatesInRange(range: DateRange) {
  const dates: string[] = [];
  for (let cursor = range.from; cursor <= range.to; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

export function getQuickPeriods(today: string): Record<Exclude<PeriodPreset, "custom">, DateRange> {
  const monthStart = `${today.slice(0, 7)}-01`;
  const [year, month] = today.split("-").map(Number);
  const previousMonthLast = new Date(Date.UTC(year, month - 1, 0, 12));
  const previousMonthTo = fromUtcDate(previousMonthLast);
  return {
    today: { from: today, to: today },
    yesterday: { from: addDays(today, -1), to: addDays(today, -1) },
    "last-7": { from: addDays(today, -6), to: today },
    "last-15": { from: addDays(today, -14), to: today },
    "last-30": { from: addDays(today, -29), to: today },
    "current-month": { from: monthStart, to: today },
    "previous-month": { from: `${previousMonthTo.slice(0, 7)}-01`, to: previousMonthTo },
  };
}

export function identifyPeriodPreset(range: DateRange, today: string): PeriodPreset {
  const match = Object.entries(getQuickPeriods(today)).find(([, candidate]) => candidate.from === range.from && candidate.to === range.to);
  return (match?.[0] as PeriodPreset | undefined) ?? "custom";
}

export function resolvePeriod(from: string | undefined, to: string | undefined, today: string) {
  const fallback = getQuickPeriods(today)["current-month"];
  if (!from && !to) return { range: fallback, validationMessage: null };
  if (!from || !to || !isValidAnalyticsDate(from, today) || !isValidAnalyticsDate(to, today) || from > to) {
    return { range: fallback, validationMessage: "O período informado era inválido. Exibimos o mês atual." };
  }
  return { range: { from, to }, validationMessage: null };
}

export function getEquivalentPreviousPeriod(range: DateRange): DateRange {
  const days = inclusiveDays(range);
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

function subtractCalendarMonth(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const targetMonthIndex = month - 2;
  const targetYear = targetMonthIndex < 0 ? year - 1 : year;
  const normalizedMonthIndex = (targetMonthIndex + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonthIndex + 1, 0, 12)).getUTCDate();
  return fromUtcDate(new Date(Date.UTC(targetYear, normalizedMonthIndex, Math.min(day, lastDay), 12)));
}

export function getPreviousMonthPeriod(range: DateRange): DateRange {
  return { from: subtractCalendarMonth(range.from), to: subtractCalendarMonth(range.to) };
}

export function resolveComparisonPeriod(
  mode: ComparisonMode,
  current: DateRange,
  today: string,
  customFrom?: string,
  customTo?: string,
) {
  if (mode === "none") return { range: null, validationMessage: null };
  if (mode === "previous-period") return { range: getEquivalentPreviousPeriod(current), validationMessage: null };
  if (mode === "previous-month") return { range: getPreviousMonthPeriod(current), validationMessage: null };
  if (!customFrom || !customTo || !isValidAnalyticsDate(customFrom, today) || !isValidAnalyticsDate(customTo, today) || customFrom > customTo) {
    return { range: null, validationMessage: "O período de comparação personalizado é inválido." };
  }
  return { range: { from: customFrom, to: customTo }, validationMessage: null };
}

export type PercentageVariation = { kind: "value"; value: number } | { kind: "new-result" };

export function percentageVariation(current: number, previous: number): PercentageVariation {
  if (previous === 0) return current === 0 ? { kind: "value", value: 0 } : { kind: "new-result" };
  return { kind: "value", value: (current - previous) / Math.abs(previous) };
}

export function percentagePointVariation(currentRate: number, previousRate: number) {
  return (currentRate - previousRate) * 100;
}
