"use client";

import { Button } from "@/components/ui/button";

export default function HistoryError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <div className="mx-auto max-w-4xl p-6"><section className="rounded-xl border border-destructive/30 bg-destructive/10 p-5"><h1 className="font-bold text-destructive">Não foi possível carregar o histórico</h1><p className="mt-1 text-sm text-muted-foreground">Tente novamente em alguns instantes.</p><Button className="mt-4 min-h-11" onClick={reset} type="button">Tentar novamente</Button></section></div>;
}
