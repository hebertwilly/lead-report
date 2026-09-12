"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Save } from "lucide-react";
import { saveReportSource } from "@/app/(protected)/reportes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OBJECTION_TYPES } from "@/lib/reports/constants";
import { initialSaveReportSourceState } from "@/lib/reports/save-report-source-state";
import type { ReportSource } from "@/lib/reports/data.server";

type CityDraft = { city: string; state: string; quantity: number };
type ReportSourceFormProps = { reportDate: string; sourceId: string; source: ReportSource | undefined };

export function ReportSourceForm({ reportDate, sourceId, source }: Readonly<ReportSourceFormProps>) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveReportSource, initialSaveReportSourceState);
  const [hadContacts, setHadContacts] = useState<"yes" | "no" | "">(source ? (source.status === "NO_CONTACTS" ? "no" : "yes") : "");
  const [cities, setCities] = useState<CityDraft[]>(source?.shippingCities.map(({ city, state, quantity }) => ({ city, state, quantity })) ?? []);
  const [hasOtherCity, setHasOtherCity] = useState(source?.shippingCities.length ? "yes" : "no");

  useEffect(() => { if (state.success) router.push(`/reportes?data=${reportDate}&sucesso=1`); }, [reportDate, router, state.success]);

  const defaultObjection = (type: string) => source?.objections.find((objection) => objection.type === type)?.quantity ?? 0;
  const changeCity = (index: number, key: keyof CityDraft, value: string) => setCities((current) => current.map((city, cityIndex) => cityIndex === index ? { ...city, [key]: key === "quantity" ? Number(value) : value } : city));

  return <form action={formAction} className="space-y-6"><input type="hidden" name="report-date" value={reportDate} /><input type="hidden" name="source-id" value={sourceId} />
    <section className="space-y-3"><h2 className="text-lg font-bold">Houve contatos desta origem nesta data?</h2><div className="grid gap-3 sm:grid-cols-2"><Choice checked={hadContacts === "yes"} id="contacts-yes" label="Sim" description="Preencher métricas e informações comerciais." onChange={() => setHadContacts("yes")} value="yes" /><Choice checked={hadContacts === "no"} id="contacts-no" label="Não" description="A origem será registrada sem contatos, com métricas zeradas." onChange={() => setHadContacts("no")} value="no" /></div></section>
    {hadContacts === "yes" ? <><section className="space-y-4 rounded-xl border p-4 sm:p-5"><div><h2 className="font-bold">Funil comercial</h2><p className="text-sm text-muted-foreground">Informe somente valores inteiros não negativos.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><NumberField defaultValue={source?.leads_received ?? 0} label="Leads recebidos" name="leads-received" /><NumberField defaultValue={source?.leads_answered ?? 0} label="Leads respondidos" name="leads-answered" /><NumberField defaultValue={source?.leads_interested ?? 0} label="Leads interessados" name="leads-interested" /><NumberField defaultValue={source?.sales ?? 0} label="Vendas realizadas" name="sales" /><div><Label htmlFor="revenue">Faturamento (R$)</Label><Input className="mt-2 min-h-11" defaultValue={source?.revenue ?? 0} id="revenue" inputMode="decimal" min="0" name="revenue" required type="number" step="0.01" /></div></div></section>
      <section className="space-y-4 rounded-xl border p-4 sm:p-5"><div><h2 className="font-bold">Motivos de não conversão</h2><p className="text-sm text-muted-foreground">Quantidade de leads por motivo. Um lead pode aparecer em mais de um motivo.</p></div><div className="grid gap-4 sm:grid-cols-2">{OBJECTION_TYPES.map((objection) => <NumberField key={objection.type} defaultValue={defaultObjection(objection.type)} label={objection.label} name={`objection-${objection.type}`} />)}</div></section>
      <section className="space-y-4 rounded-xl border p-4 sm:p-5"><div><h2 className="font-bold">Distribuição das vendas</h2><p className="text-sm text-muted-foreground">Houve vendas com envio para outra cidade?</p></div><div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input checked={hasOtherCity === "yes"} name="has-other-city" onChange={() => setHasOtherCity("yes")} type="radio" value="yes" />Sim</label><label className="flex items-center gap-2 text-sm"><input checked={hasOtherCity === "no"} name="has-other-city" onChange={() => { setHasOtherCity("no"); setCities([]); }} type="radio" value="no" />Não</label></div><input type="hidden" name="shipping-count" value={hasOtherCity === "yes" ? cities.length : 0} />{hasOtherCity === "yes" ? <><div className="space-y-3">{cities.map((city, index) => <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_5rem_7rem_auto]"><div><Label htmlFor={`shipping-city-${index}`}>Cidade</Label><Input className="mt-2 min-h-11" id={`shipping-city-${index}`} name={`shipping-city-${index}`} value={city.city} onChange={(event) => changeCity(index, "city", event.target.value)} required /></div><div><Label htmlFor={`shipping-state-${index}`}>UF</Label><Input className="mt-2 min-h-11 uppercase" id={`shipping-state-${index}`} maxLength={2} name={`shipping-state-${index}`} value={city.state} onChange={(event) => changeCity(index, "state", event.target.value)} required /></div><div><Label htmlFor={`shipping-quantity-${index}`}>Quantidade</Label><Input className="mt-2 min-h-11" id={`shipping-quantity-${index}`} min="1" name={`shipping-quantity-${index}`} type="number" value={city.quantity} onChange={(event) => changeCity(index, "quantity", event.target.value)} required /></div><Button type="button" variant="ghost" className="min-h-11 self-end text-destructive" onClick={() => setCities((current) => current.filter((_, cityIndex) => cityIndex !== index))}><Minus aria-hidden="true" className="mr-1 size-4" />Remover</Button></div>)}</div><Button type="button" variant="outline" className="min-h-11" onClick={() => setCities((current) => [...current, { city: "", state: "", quantity: 1 }])}><Plus aria-hidden="true" className="mr-2 size-4" />Adicionar cidade</Button></> : null}</section></> : null}
    {hadContacts === "no" ? <p className="rounded-lg bg-muted p-4 text-sm">Esta origem será salva como <strong>Sem contatos</strong>, com todas as métricas zeradas.</p> : null}
    <section><Label htmlFor="notes">Observações <span className="font-normal text-muted-foreground">(opcional)</span></Label><textarea className="mt-2 flex min-h-28 w-full rounded-md border bg-background px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" defaultValue={source?.notes ?? ""} id="notes" name="notes" /></section>
    {state.error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p> : null}
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" className="min-h-11" onClick={() => router.push(`/reportes?data=${reportDate}`)}>Cancelar</Button><Button type="submit" className="min-h-11" disabled={pending}>{pending ? "Salvando..." : <><Save aria-hidden="true" className="mr-2 size-4" />Salvar origem</>}</Button></div>
  </form>;
}

function Choice({ checked, id, label, description, onChange, value }: Readonly<{ checked: boolean; id: string; label: string; description: string; onChange: () => void; value: "yes" | "no" }>) { return <label htmlFor={id} className="flex cursor-pointer gap-3 rounded-xl border p-4 has-[:checked]:border-primary has-[:checked]:bg-accent"><input checked={checked} id={id} name="had-contacts" onChange={onChange} type="radio" value={value} /><span><span className="block font-semibold">{label}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span></label>; }
function NumberField({ defaultValue, label, name }: Readonly<{ defaultValue: number; label: string; name: string }>) { return <div><Label htmlFor={name}>{label}</Label><Input className="mt-2 min-h-11" defaultValue={defaultValue} id={name} min="0" name={name} required type="number" inputMode="numeric" step="1" /></div>; }
