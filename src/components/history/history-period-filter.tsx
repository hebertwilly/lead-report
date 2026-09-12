"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

const MONTHS = [
  { value: "01", label: "Janeiro" }, { value: "02", label: "Fevereiro" }, { value: "03", label: "Março" },
  { value: "04", label: "Abril" }, { value: "05", label: "Maio" }, { value: "06", label: "Junho" },
  { value: "07", label: "Julho" }, { value: "08", label: "Agosto" }, { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" }, { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
] as const;

type HistoryPeriodFilterProps = { month: string; year: string; currentMonth: string; currentYear: string };

export function HistoryPeriodFilter({ month, year, currentMonth, currentYear }: Readonly<HistoryPeriodFilterProps>) {
  const router = useRouter();
  const years = Array.from({ length: Number(currentYear) - 2019 }, (_, index) => String(Number(currentYear) - index));

  const updatePeriod = (event: FormEvent<HTMLFormElement>) => {
    const values = new FormData(event.currentTarget);
    const selectedMonth = values.get("mes");
    const selectedYear = values.get("ano");
    if (typeof selectedMonth !== "string" || typeof selectedYear !== "string") return;
    router.replace(`/historico?mes=${selectedMonth}&ano=${selectedYear}`);
  };

  return <form aria-label="Selecionar período do histórico" className="grid grid-cols-2 gap-3 sm:flex sm:items-end" onChange={updatePeriod}><label className="grid gap-1.5 text-sm font-medium" htmlFor="history-month">Mês<select className="min-h-11 rounded-md border bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" defaultValue={month} id="history-month" name="mes">{MONTHS.map((item) => <option key={item.value} disabled={year === currentYear && item.value > currentMonth} value={item.value}>{item.label}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium" htmlFor="history-year">Ano<select className="min-h-11 rounded-md border bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" defaultValue={year} id="history-year" name="ano">{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></form>;
}
