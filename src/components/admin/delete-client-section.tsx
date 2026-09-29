"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteManagedClient } from "@/app/(protected)/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = { clientId: string; clientName: string; username: string | null };

export function DeleteClientSection({ clientId, clientName, username }: Readonly<Props>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const canConfirm = Boolean(username) && confirmation === username;
  return <section className="space-y-3 border-t-2 border-destructive/30 pt-6">
    <div><p className="text-sm font-semibold text-destructive">Zona de perigo</p><h2 className="mt-1 text-xl font-bold">Excluir cliente</h2><p className="mt-1 text-sm text-muted-foreground">Exclui permanentemente este cliente, seus reportes, origens, metas, histórico e acesso à plataforma. Esta ação não pode ser desfeita.</p></div>
    <Card className="border-destructive/40"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><h3 className="font-bold">Excluir cliente definitivamente</h3><p className="mt-1 text-sm text-muted-foreground">Exige confirmação pelo username atual.</p></div><Button className="min-h-11 w-full sm:w-auto" disabled={!username} onClick={() => dialogRef.current?.showModal()} type="button" variant="destructive">Excluir cliente</Button></CardContent></Card>
    {!username ? <p role="alert" className="text-sm text-destructive">O acesso CLIENT está inconsistente; a exclusão foi bloqueada para revisão administrativa.</p> : null}
    <dialog aria-labelledby="delete-client-title" className="m-auto max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50" ref={dialogRef}>
      <div className="space-y-5 p-5 sm:p-6"><div><h2 className="text-xl font-bold" id="delete-client-title">Excluir cliente definitivamente?</h2><p className="mt-2 text-sm text-muted-foreground">Esta ação excluirá permanentemente o cliente <strong>{clientName}</strong>, todos os seus reportes, origens, metas, histórico e o acesso à plataforma.</p></div><div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><p><strong>Cliente:</strong> {clientName}</p><p className="mt-1"><strong>Username:</strong> {username ?? "indisponível"}</p><p className="mt-2 text-destructive">A exclusão é permanente e não pode ser desfeita.</p></div><form action={deleteManagedClient} className="space-y-4"><input name="client-id" type="hidden" value={clientId} /><div className="space-y-2"><label className="text-sm font-medium" htmlFor={`delete-confirmation-${clientId}`}>Digite exatamente “{username}” para confirmar</label><input autoComplete="off" className="min-h-11 w-full rounded-md border bg-background px-3" id={`delete-confirmation-${clientId}`} name="username-confirmation" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} /></div><DeleteActions canConfirm={canConfirm} onCancel={() => dialogRef.current?.close()} /></form></div>
    </dialog>
  </section>;
}

function DeleteActions({ canConfirm, onCancel }: Readonly<{ canConfirm: boolean; onCancel: () => void }>) {
  const { pending } = useFormStatus();
  return <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button className="min-h-11" disabled={pending} onClick={onCancel} type="button" variant="outline">Cancelar</Button><Button className="min-h-11" disabled={!canConfirm || pending} type="submit" variant="destructive">{pending ? "Excluindo..." : "Excluir cliente definitivamente"}</Button></div>;
}
