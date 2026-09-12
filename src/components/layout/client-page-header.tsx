import Link from "next/link";
import { BarChart3, ClipboardPlus, History, LogOut } from "lucide-react";
import { logout } from "@/app/(protected)/actions";
import { Button } from "@/components/ui/button";

type ClientPageHeaderProps = { activePage: "dashboard" | "reportes" | "historico"; clientName: string };

export function ClientPageHeader({ activePage, clientName }: Readonly<ClientPageHeaderProps>) {
  return <header className="border-b bg-card"><div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8"><Link href="/dashboard" className="mr-auto min-w-0 text-base font-bold tracking-tight text-primary">Lead Report <span className="hidden font-normal text-muted-foreground sm:inline">• {clientName}</span></Link><nav aria-label="Navegação do cliente" className="order-3 flex w-full gap-1 sm:order-none sm:w-auto"><Button asChild variant={activePage === "dashboard" ? "secondary" : "ghost"} className="min-h-10 flex-1 gap-2 sm:flex-none"><Link href="/dashboard"><BarChart3 aria-hidden="true" className="size-4" />Home</Link></Button><Button asChild variant={activePage === "reportes" ? "secondary" : "ghost"} className="min-h-10 flex-1 gap-2 sm:flex-none"><Link href="/reportes"><ClipboardPlus aria-hidden="true" className="size-4" />Reporte</Link></Button><Button asChild variant={activePage === "historico" ? "secondary" : "ghost"} className="min-h-10 flex-1 gap-2 sm:flex-none"><Link href="/historico"><History aria-hidden="true" className="size-4" />Histórico</Link></Button></nav><form action={logout}><Button type="submit" variant="ghost" size="icon" aria-label="Sair"><LogOut aria-hidden="true" className="size-4" /></Button></form></div></header>;
}
