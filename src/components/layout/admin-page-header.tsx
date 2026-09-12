import Link from "next/link";
import { Building2, LayoutDashboard, LogOut } from "lucide-react";
import { logout } from "@/app/(protected)/actions";
import { Button } from "@/components/ui/button";

export function AdminPageHeader({ username }: Readonly<{ username: string }>) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
        <Link href="/admin" className="mr-auto min-w-0 text-base font-bold tracking-tight text-primary">
          Lead Report <span className="hidden font-normal text-muted-foreground md:inline">• ADMIN {username}</span>
        </Link>
        <nav aria-label="Navegação administrativa" className="order-3 flex w-full gap-1 sm:order-none sm:w-auto">
          <Button asChild className="min-h-10 flex-1 gap-2 sm:flex-none" variant="ghost">
            <Link href="/admin"><LayoutDashboard aria-hidden="true" className="size-4" />Painel</Link>
          </Button>
          <Button asChild className="min-h-10 flex-1 gap-2 sm:flex-none" variant="ghost">
            <Link href="/admin/clientes"><Building2 aria-hidden="true" className="size-4" />Clientes</Link>
          </Button>
        </nav>
        <form action={logout}>
          <Button className="min-h-10 gap-2" type="submit" variant="ghost">
            <LogOut aria-hidden="true" className="size-4" />Sair
          </Button>
        </form>
      </div>
    </header>
  );
}
