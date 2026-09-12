"use client";

import { useId, useState } from "react";
import { createManagedClient } from "@/app/(protected)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeUsername } from "@/lib/auth/username";

type SourceDraft = { id: string; name: string; active: boolean; primary: boolean };

const defaultSources: SourceDraft[] = [
  { id: "paid-traffic", name: "Tráfego Pago", active: true, primary: true },
  { id: "organic", name: "Orgânico", active: true, primary: false },
  { id: "instagram-links", name: "Instagram / Links", active: true, primary: false },
];

function nextSourceId() {
  return `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ClientRegistrationForm() {
  const formId = useId();
  const [username, setUsername] = useState("");
  const [sources, setSources] = useState(defaultSources);
  const [validationError, setValidationError] = useState<string | null>(null);
  const normalizedUsername = normalizeUsername(username);

  function updateSource(id: string, patch: Partial<SourceDraft>) {
    setSources((current) => current.map((source) => {
      if (source.id !== id) return source;
      const updated = { ...source, ...patch };
      return patch.active === false ? { ...updated, primary: false } : updated;
    }));
  }

  function setPrimary(id: string, primary: boolean) {
    setSources((current) => current.map((source) => ({
      ...source,
      primary: primary ? source.id === id : source.id === id ? false : source.primary,
    })));
  }

  function validateBeforeSubmit(event: React.FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(form.get("password-confirmation") ?? "");
    const activeSources = sources.filter((source) => source.active);
    const primarySources = activeSources.filter((source) => source.primary);
    const sourceNames = sources.map((source) => source.name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());

    if (password !== passwordConfirmation) {
      event.preventDefault();
      setValidationError("As senhas não coincidem.");
      return;
    }
    if (!activeSources.length) {
      event.preventDefault();
      setValidationError("Mantenha pelo menos uma origem ativa.");
      return;
    }
    if (primarySources.length > 1) {
      event.preventDefault();
      setValidationError("Defina apenas uma origem principal ativa.");
      return;
    }
    if (sourceNames.some((name) => !name) || new Set(sourceNames).size !== sourceNames.length) {
      event.preventDefault();
      setValidationError("Os nomes das origens devem ser preenchidos e não podem se repetir.");
      return;
    }
    setValidationError(null);
  }

  return (
    <form action={createManagedClient} className="mt-4 grid gap-5" onSubmit={validateBeforeSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${formId}-name`}>Nome do cliente</Label>
          <Input id={`${formId}-name`} className="min-h-11" name="name" placeholder="Ex.: K-Britto" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-username`}>Username</Label>
          <Input id={`${formId}-username`} className="min-h-11" name="username" onChange={(event) => setUsername(event.target.value)} placeholder="Ex.: k-britto" required />
          <p className="text-xs text-muted-foreground">
            {normalizedUsername ? <>Será usado como login e URL: <strong className="font-medium text-foreground">{normalizedUsername}</strong></> : "Use letras, números e hífens."}
          </p>
        </div>
        <div className="flex items-end pb-1">
          <Label className="flex min-h-11 items-center gap-2"><input defaultChecked name="active" type="checkbox" />Acesso ativo</Label>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-password`}>Senha</Label>
          <Input id={`${formId}-password`} className="min-h-11" minLength={8} name="password" placeholder="Pelo menos 8 caracteres" required type="password" autoComplete="new-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-password-confirmation`}>Confirmar senha</Label>
          <Input id={`${formId}-password-confirmation`} className="min-h-11" minLength={8} name="password-confirmation" required type="password" autoComplete="new-password" />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-lg border p-3 sm:p-4">
        <legend className="px-1 font-semibold">Origens de leads</legend>
        <p className="text-sm text-muted-foreground">Defina as origens que estarão disponíveis desde o início do acompanhamento.</p>
        <input name="sources" type="hidden" value={JSON.stringify(sources)} />
        <div className="space-y-3">
          {sources.map((source, index) => (
            <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end" key={source.id}>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-${source.id}`}>Nome da origem {index + 1}</Label>
                <Input id={`${formId}-${source.id}`} className="min-h-11" value={source.name} onChange={(event) => updateSource(source.id, { name: event.target.value })} />
              </div>
              <Label className="flex min-h-11 items-center gap-2"><input checked={source.active} onChange={(event) => updateSource(source.id, { active: event.target.checked })} type="checkbox" />Ativa</Label>
              <Label className="flex min-h-11 items-center gap-2"><input checked={source.primary} disabled={!source.active} onChange={(event) => setPrimary(source.id, event.target.checked)} type="checkbox" />Principal</Label>
              <Button className="min-h-11" onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))} type="button" variant="outline">Remover</Button>
            </div>
          ))}
        </div>
        <Button className="min-h-11" onClick={() => setSources((current) => [...current, { id: nextSourceId(), name: "", active: true, primary: false }])} type="button" variant="outline">+ Adicionar origem</Button>
      </fieldset>
      {validationError ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{validationError}</p> : null}
      <Button className="min-h-11 w-full sm:w-auto" type="submit">Criar cliente e acesso</Button>
    </form>
  );
}
