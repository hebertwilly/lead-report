import { Building2, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { logout } from "@/app/(protected)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionProfile } from "@/lib/auth/session";

type SessionCardProps = { profile: SessionProfile; title: string; description: string };

export function SessionCard({ profile, title, description }: Readonly<SessionCardProps>) {
  const isClient = profile.role === "CLIENT";
  return (
    <Card className="w-full max-w-xl shadow-xl shadow-slate-950/5">
      <CardHeader className="space-y-2"><CardTitle className="text-2xl tracking-tight">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="space-y-5"><dl className="divide-y rounded-lg border bg-muted/30">
        <InfoRow icon={<UserRound className="size-4" />} label="Usuário" value={profile.username} />
        <InfoRow icon={<ShieldCheck className="size-4" />} label="Perfil" value={isClient ? "Cliente" : "Administrador"} />
        {isClient ? <InfoRow icon={<Building2 className="size-4" />} label="Cliente" value={profile.client?.name ?? "Não vinculado"} /> : null}
      </dl><form action={logout}><Button type="submit" variant="outline" className="h-11 w-full gap-2 sm:w-auto"><LogOut aria-hidden="true" className="size-4" />Sair</Button></form></CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value }: Readonly<{ icon: React.ReactNode; label: string; value: string }>) {
  return <div className="flex items-center gap-3 px-4 py-3 text-sm"><span className="text-muted-foreground">{icon}</span><dt className="text-muted-foreground">{label}</dt><dd className="ml-auto max-w-[60%] truncate text-right font-medium">{value}</dd></div>;
}
