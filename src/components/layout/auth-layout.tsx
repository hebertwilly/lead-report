import { BarChart3, CheckCircle2, TrendingUp } from "lucide-react";

export function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex items-center justify-center px-4 py-8 sm:px-6 lg:px-12"><div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><BarChart3 className="size-5" /></div><span className="text-lg font-semibold tracking-tight">Lead Report</span></div>
        {children}<p className="mt-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Lead Report</p>
      </div></section>
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-20 -top-24 size-96 rounded-full bg-white/10" /><div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-cyan-300/10" />
        <div className="relative max-w-lg"><p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-blue-100">Gestão comercial diária</p><h1 className="text-4xl font-semibold leading-tight tracking-tight">Clareza para transformar cada lead em resultado.</h1><p className="mt-5 text-base leading-7 text-blue-100">Acompanhe a qualidade dos contatos, vendas e oportunidades do seu negócio em um só lugar.</p></div>
        <ul className="relative space-y-4 text-sm text-blue-50"><Feature icon={<TrendingUp className="size-5" />} text="Indicadores comerciais em tempo real" /><Feature icon={<CheckCircle2 className="size-5" />} text="Reporte diário simples e organizado" /></ul>
      </aside>
    </main>
  );
}

function Feature({ icon, text }: Readonly<{ icon: React.ReactNode; text: string }>) { return <li className="flex items-center gap-3">{icon}<span>{text}</span></li>; }
