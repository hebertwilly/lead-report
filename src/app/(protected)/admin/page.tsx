import Link from "next/link";
import { Building2, CircleOff, Clock3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminDashboardData, type AdminClientOverview } from "@/lib/admin/data.server";
import { formatReportDate, getTodayInSaoPaulo } from "@/lib/reports/date";

export default async function AdminPage() {
  await requireAdmin();
  const data = await getAdminDashboardData(getTodayInSaoPaulo());

  return <main className="mx-auto max-w-7xl space-y-6 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-medium text-primary">Área administrativa</p><h1 className="text-2xl font-bold tracking-tight">Operação de clientes</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe rapidamente os clientes que precisam de atenção.</p></div>
      <Button asChild className="min-h-11"><Link href="/admin/clientes"><Users aria-hidden="true" className="mr-2 size-4" />Gerenciar clientes</Link></Button>
    </section>

    <section aria-label="Resumo de clientes" className="grid gap-3 sm:grid-cols-3">
      <Metric icon={Building2} label="Clientes ativos" value={data.activeClients} />
      <Metric icon={CircleOff} label="Clientes inativos" value={data.inactiveClients} />
      <Metric icon={Clock3} label="Clientes com pendências" value={data.clientsWithPendingReports.length} />
    </section>

    <section aria-labelledby="clientes-pendentes" className="space-y-3">
      <div><h2 id="clientes-pendentes" className="text-xl font-bold">Clientes com reportes pendentes</h2><p className="mt-1 text-sm text-muted-foreground">Ordenados pelas pendências que exigem atenção primeiro.</p></div>
      {data.clientsWithPendingReports.length === 0 ? <EmptyState /> : <PendingClientsCarousel clients={data.clientsWithPendingReports} />}
    </section>
  </main>;
}

function Metric({ icon: Icon, label, value }: Readonly<{ icon: typeof Building2; label: string; value: number }>) {
  return <Card><CardContent className="flex items-center gap-3 p-4 sm:p-5"><div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Icon aria-hidden="true" className="size-5" /></div><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold tracking-tight">{value}</p></div></CardContent></Card>;
}

function PendingClientsCarousel({ clients }: Readonly<{ clients: AdminClientOverview[] }>) {
  return <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
    <span className="sr-only">Deslize horizontalmente para ver os demais clientes com pendências.</span>
    {clients.map((client) => <PendingClientCard client={client} key={client.id} />)}
  </div>;
}

function PendingClientCard({ client }: Readonly<{ client: AdminClientOverview }>) {
  const pendingLabel = client.pendingDays === 1 ? "1 dia pendente" : `${client.pendingDays} dias pendentes`;
  return <Card className="w-[calc(100vw-3rem)] shrink-0 snap-start sm:w-72 lg:w-80"><CardContent className="space-y-4 p-4 sm:p-5"><div><h3 className="text-lg font-bold tracking-tight">{client.name}</h3><p className="mt-2 font-semibold text-amber-700">{pendingLabel}</p></div><dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">Pendência mais antiga</dt><dd className="mt-1 font-medium">{client.oldestPendingDate ? formatReportDate(client.oldestPendingDate) : "—"}</dd></div><div><dt className="text-muted-foreground">Último reporte</dt><dd className="mt-1 font-medium">{client.lastReportDate ? formatReportDate(client.lastReportDate) : "Nenhum"}</dd></div></dl><Button asChild className="min-h-11 w-full" variant="outline"><Link href={`/admin/clientes/${client.id}`}>Ver cliente</Link></Button></CardContent></Card>;
}

function EmptyState() {
  return <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-5"><h3 className="font-semibold text-emerald-950">Reportes em dia</h3><p className="mt-1 text-sm text-emerald-900">Nenhum cliente possui reportes pendentes no período.</p></CardContent></Card>;
}
