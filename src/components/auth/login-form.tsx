import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/app/(auth)/login/actions";

type LoginFormProps = { error?: string };

const loginMessages: Record<string, string> = {
  invalid: "Usuário ou senha inválidos.",
  inactive: "Esta conta não está disponível. Entre em contato com a agência.",
  unauthorized: "Faça login para continuar.",
  config: "O acesso ainda não está configurado neste ambiente.",
};

export function LoginForm({ error }: Readonly<LoginFormProps>) {
  return (
    <Card className="w-full shadow-xl shadow-slate-950/5"><CardHeader className="space-y-2 px-5 pt-6 sm:px-8 sm:pt-8"><CardTitle className="text-2xl tracking-tight">Acesse sua conta</CardTitle><CardDescription>Entre para acompanhar seus resultados comerciais.</CardDescription></CardHeader>
      <CardContent className="px-5 pb-6 sm:px-8 sm:pb-8"><form action={login} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="username">Usuário</Label><div className="relative"><UserRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="username" name="username" autoComplete="username" placeholder="Seu usuário" className="h-11 pl-10" /></div></div>
        <div className="space-y-2"><Label htmlFor="password">Senha</Label><div className="relative"><LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" name="password" type="password" autoComplete="current-password" placeholder="Sua senha" className="h-11 pl-10" /></div></div>
        {error && loginMessages[error] ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{loginMessages[error]}</p> : null}
        <Button type="submit" className="h-11 w-full gap-2">Entrar <ArrowRight aria-hidden="true" className="size-4" /></Button><p className="text-center text-xs leading-relaxed text-muted-foreground">O acesso é fornecido pela sua agência.</p>
      </form></CardContent>
    </Card>
  );
}
