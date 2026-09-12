import Link from "next/link";
import { ClientRegistrationForm } from "@/components/admin/client-registration-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminDashboardData } from "@/lib/admin/data.server";
import { formatCurrency, formatReportDate, getTodayInSaoPaulo } from "@/lib/reports/date";

type SearchParams = Promise<{ q?: string; status?: string; sucesso?: string; erro?: string }>;

export default async function ClientsPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  await requireAdmin();
  const params = await searchParams;
  const data = await getAdminDashboardData(getTodayInSaoPaulo());
  const query = params.q?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const clients = data.clients.filter((client) => {
    const matchesQuery = !query || client.name.toLocaleLowerCase("pt-BR").includes(query) || client.username?.toLocaleLowerCase("pt-BR").includes(query);
    const matchesStatus = params.status === "ativos" ? client.active : params.status === "inativos" ? !client.active : true;
    return matchesQuery && matchesStatus;
  });

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
    <div><Link className="text-sm font-medium text-primary" href="/admin">← Voltar ao painel</Link><h1 className="mt-3 text-2xl font-bold">Gerenciar clientes</h1></div>
    {params.sucesso ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{params.sucesso}</p> : null}
    {params.erro ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{params.erro}</p> : null}

    <Card><CardContent className="p-4 sm:p-5"><form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><input className="min-h-11 rounded-md border bg-background px-3" defaultValue={params.q ?? ""} name="q" placeholder="Buscar por nome ou username" /><select aria-label="Filtrar clientes por status" className="min-h-11 rounded-md border bg-background px-3" defaultValue={params.status ?? ""} name="status"><option value="">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option></select><Button className="min-h-11" type="submit">Buscar</Button></form></CardContent></Card>

    <section aria-label="Clientes cadastrados" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {clients.map((client) => <Card key={client.id}><CardContent className="flex h-full flex-col p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-bold">{client.name}</h2><p className="truncate text-sm text-muted-foreground">{client.username ?? client.slug}</p></div><Badge variant={client.active && client.accessActive ? "success" : "outline"}>{client.active && client.accessActive ? "Ativo" : "Inativo"}</Badge></div><dl className="mt-5 grid gap-3 text-sm"><div><dt className="text-muted-foreground">Pendências</dt><dd className="font-semibold">{client.pendingDaysThisMonth} {client.pendingDaysThisMonth === 1 ? "dia" : "dias"}</dd></div><div><dt className="text-muted-foreground">Último reporte</dt><dd className="font-semibold">{client.lastReportDate ? formatReportDate(client.lastReportDate) : "Nenhum"}</dd></div><div className="grid grid-cols-2 gap-3 border-t pt-3"><div><dt className="text-muted-foreground">Vendas no mês</dt><dd className="font-semibold">{client.salesThisMonth}</dd></div><div><dt className="text-muted-foreground">Faturamento no mês</dt><dd className="font-semibold">{formatCurrency(client.revenueThisMonth)}</dd></div></div></dl><Button asChild className="mt-5 min-h-11 w-full" variant="outline"><Link href={`/admin/clientes/${client.id}`}>Abrir</Link></Button></CardContent></Card>)}
    </section>
    {!clients.length ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhum cliente encontrado com estes filtros.</p> : null}

    <Card><CardContent className="p-4 sm:p-5"><h2 className="text-lg font-bold">Cadastrar cliente</h2><p className="mt-1 text-sm text-muted-foreground">O username será o login e o identificador estável do cliente.</p><ClientRegistrationForm /></CardContent></Card>
  </main>;
}
