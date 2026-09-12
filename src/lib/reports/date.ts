const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

export function getTodayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
}

/** Data padrão do reporte: o dia calendário anterior no fuso operacional. */
export function getDefaultReportDateInSaoPaulo() {
  const [year, month, day] = getTodayInSaoPaulo().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function getPreviousReportDate(date: string) {
  const previous = new Date(`${date}T12:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

/** Primeiro dia do mês em que o cliente passou a ser acompanhado. */
export function getPendingStartDate(reportingStartedAt: string) {
  return `${reportingStartedAt.slice(0, 7)}-01`;
}

/**
 * Datas que podem gerar cobrança operacional de reporte. Datas anteriores ao
 * início do acompanhamento e o dia em curso ficam fora desta lista.
 */
export function getChargeableReportDates(rangeStart: string, reportingStartedAt: string, today: string) {
  const startDate = [rangeStart, getPendingStartDate(reportingStartedAt)].sort()[1];
  const endDate = getPreviousReportDate(today);
  if (startDate > endDate) return [];

  const cursor = new Date(`${endDate}T12:00:00.000Z`);
  const start = new Date(`${startDate}T12:00:00.000Z`);
  const dates: string[] = [];
  while (cursor >= start) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates;
}

export function isChargeableReportDate(reportDate: string, reportingStartedAt: string, today: string) {
  return reportDate >= getPendingStartDate(reportingStartedAt) && reportDate <= getPreviousReportDate(today);
}

/** `inactiveFrom` é exclusivo: a origem ainda vale no dia anterior. */
export function isDateWithinActivePeriod(reportDate: string, activeFrom: string, inactiveFrom: string | null) {
  return activeFrom <= reportDate && (!inactiveFrom || inactiveFrom > reportDate);
}

/** Datas de um mês em ordem decrescente; no mês atual, termina na data de hoje no fuso operacional. */
export function getDatesForMonth(month: string, today: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = month === today.slice(0, 7)
    ? Number(today.slice(8, 10))
    : new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dates: string[] = [];

  for (let day = lastDay; day >= 1; day -= 1) {
    dates.push(`${month}-${String(day).padStart(2, "0")}`);
  }

  return dates;
}

export function isValidReportDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > getTodayInSaoPaulo()) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function formatReportDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function formatShortReportDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(".", "")
    .toUpperCase();
}

export function formatMonth(value: string) {
  const [year, month] = value.split("-");
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(Number(year), Number(month) - 1, 1),
  );
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatPercentage(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

export function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}
