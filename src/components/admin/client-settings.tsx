import { resetManagedClientPassword, saveLeadSource, setManagedClientActive, updateManagedClientInformation } from "@/app/(protected)/admin/actions";
import { ClientGoalsSection } from "@/components/admin/client-goals-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminClientConfiguration } from "@/lib/admin/data.server";
import type { ClientGoal } from "@/lib/goals/data.server";
import { formatReportDate } from "@/lib/reports/date";
import { formatWhatsAppPhone } from "@/lib/whatsapp";

export function ClientSettings({ client, goals }: Readonly<{ client: AdminClientConfiguration; goals: ClientGoal[] }>) {
  const accessActive = client.active && client.accessActive;
  return <div className="space-y-6">
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Identificação</h2>
      <Card>
        <CardContent className="grid gap-5 p-4 sm:p-5">
          <form action={updateManagedClientInformation} className="grid gap-4 sm:grid-cols-2">
            <input name="client-id" type="hidden" value={client.id} />
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="client-name">Nome comercial</label>
              <input className="min-h-11 w-full rounded-md border bg-background px-3" defaultValue={client.name} id="client-name" name="name" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="client-whatsapp-phone">WhatsApp do responsável</label>
              <input autoComplete="tel" className="min-h-11 w-full rounded-md border bg-background px-3" defaultValue={client.whatsappPhone ? formatWhatsAppPhone(client.whatsappPhone) : ""} id="client-whatsapp-phone" inputMode="tel" maxLength={25} name="whatsapp-phone" placeholder="Ex.: (11) 99999-9999" type="tel" />
              <p className="text-xs text-muted-foreground">Opcional. Informe DDD e número; o DDI 55 é incluído quando necessário.</p>
            </div>
            <Button className="min-h-11 w-full sm:col-span-2 sm:w-fit" type="submit" variant="outline">Salvar informações</Button>
          </form>
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-3">
            <Info label="Username" value={client.username ?? client.slug} description="Login e identificador estável; não editável na V1." />
            <Info label="Status" value={<Badge variant={accessActive ? "success" : "outline"}>{accessActive ? "Ativo" : "Inativo"}</Badge>} />
            <Info label="Início do acompanhamento" value={formatReportDate(client.reportingStartedAt)} />
          </div>
        </CardContent>
      </Card>
    </section>
    <ClientGoalsSection clientId={client.id} goals={goals} />
    <section className="space-y-3"><h2 className="text-xl font-bold">Acesso</h2><div className="grid gap-4 md:grid-cols-2"><Card><CardContent className="p-4 sm:p-5"><h3 className="font-bold">Status do acesso</h3><p className="mt-1 text-sm text-muted-foreground">Cliente {accessActive ? "ativo" : "inativo"}.</p><form action={setManagedClientActive} className="mt-4"><input name="client-id" type="hidden" value={client.id} /><input name="active" type="hidden" value={String(!accessActive)} /><Button className="min-h-11 w-full" type="submit" variant={accessActive ? "destructive" : "default"}>{accessActive ? "Desativar acesso" : "Reativar acesso"}</Button></form></CardContent></Card><Card><CardContent className="p-4 sm:p-5"><h3 className="font-bold">Resetar senha</h3><form action={resetManagedClientPassword} className="mt-4 space-y-3"><input name="client-id" type="hidden" value={client.id} /><input aria-label="Nova senha" className="min-h-11 w-full rounded-md border px-3" minLength={8} name="password" placeholder="Nova senha" required type="password" autoComplete="new-password" /><input aria-label="Confirmar nova senha" className="min-h-11 w-full rounded-md border px-3" minLength={8} name="password-confirmation" placeholder="Confirmar nova senha" required type="password" autoComplete="new-password" /><Button className="min-h-11 w-full" type="submit" variant="outline">Salvar nova senha</Button></form></CardContent></Card></div></section>
    <section className="space-y-3"><div><h2 className="text-xl font-bold">Origens de leads</h2><p className="text-sm text-muted-foreground">As origens ativas são usadas nos novos reportes; o histórico e a vigência são preservados.</p></div>{client.leadSources.map((source) => <SourceForm clientId={client.id} key={source.id} source={source} />)}<SourceForm clientId={client.id} /></section>
  </div>;
}

function Info({ label, value, description }: Readonly<{ label: string; value: React.ReactNode; description?: string }>) {
  return <div><p className="text-sm text-muted-foreground">{label}</p><div className="mt-1 font-bold">{value}</div>{description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}</div>;
}

function SourceForm({ clientId, source }: Readonly<{ clientId: string; source?: { id: string; name: string; isActive: boolean; isPrimary: boolean } }>) {
  const inputId = `source-name-${source?.id ?? "new"}`;
  return <Card><CardContent className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{source ? source.name : "Adicionar origem"}</h3>{source ? <Badge variant={source.isActive ? "success" : "outline"}>{source.isActive ? "Ativa" : "Inativa"}</Badge> : null}</div><form action={saveLeadSource} className="mt-4 grid gap-4"><input name="client-id" type="hidden" value={clientId} />{source ? <input name="source-id" type="hidden" value={source.id} /> : null}<div className="space-y-2"><label className="text-sm font-medium" htmlFor={inputId}>Nome da origem</label><input className="min-h-11 w-full rounded-md border bg-background px-3" defaultValue={source?.name} id={inputId} maxLength={120} name="name" placeholder="Ex.: Tráfego Pago" required /></div><div className="flex flex-wrap items-center gap-5"><label className="flex min-h-11 items-center gap-2 text-sm"><input defaultChecked={source?.isActive ?? true} name="active" type="checkbox" />Ativa</label><label className="flex min-h-11 items-center gap-2 text-sm"><input defaultChecked={source?.isPrimary ?? false} name="primary" type="checkbox" />Principal</label></div><Button className="min-h-11 w-full sm:w-fit" type="submit" variant={source ? "outline" : "default"}>Salvar origem</Button></form></CardContent></Card>;
}
