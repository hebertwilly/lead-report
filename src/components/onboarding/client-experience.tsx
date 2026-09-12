"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { completeClientOnboarding } from "@/app/(protected)/actions";
import { Button } from "@/components/ui/button";
import { formatReportDate } from "@/lib/reports/date";
import type { PreviousDayPendingAlert } from "@/lib/reports/data.server";

type ClientExperienceProps = {
  onboardingCompleted: boolean;
  pendingAlert: PreviousDayPendingAlert | null;
  children: React.ReactNode;
};

type TourStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const tourContent: Record<TourStep, { message: string; nextLabel?: string }> = {
  0: { message: "Este é o acesso rápido aos seus reportes. Os dados devem ser registrados após o encerramento do dia ou no dia seguinte.", nextLabel: "Próximo" },
  1: { message: "Clique aqui para acessar seus reportes diários." },
  2: { message: "Confira a data antes de preencher. Por padrão, o sistema abre o dia anterior.", nextLabel: "Próximo" },
  3: { message: "As origens configuradas para sua operação aparecem aqui. Preencha as que se aplicarem ao dia, com prioridade para Tráfego Pago quando disponível.", nextLabel: "Próximo" },
  4: { message: "Clique em Preencher para registrar os resultados desta origem." },
  5: { message: "Informe se houve contatos. Se não houve nenhum contato dessa origem, marque Não para registrá-la como Sem contatos." },
  6: { message: "Informe os números reais do dia: leads recebidos, respondidos, interessados, vendas e faturamento. Objeções, envios e observações podem ser informados abaixo.", nextLabel: "Próximo" },
  7: { message: "Salve esta origem para registrar o reporte. Depois, atualize as demais origens que se aplicarem ao dia." },
};

export function ClientExperience({ onboardingCompleted, pendingAlert, children }: Readonly<ClientExperienceProps>) {
  const [onboardingActive, setOnboardingActive] = useState(!onboardingCompleted);
  const [suppressPendingAlert, setSuppressPendingAlert] = useState(false);

  return <>{children}<PendingReportAlert alert={pendingAlert} hidden={onboardingActive || suppressPendingAlert} onClose={() => setSuppressPendingAlert(true)} />{onboardingActive ? <ProductTour onComplete={() => { setOnboardingActive(false); setSuppressPendingAlert(true); }} /> : null}</>;
}

function PendingReportAlert({ alert, hidden, onClose }: Readonly<{ alert: PreviousDayPendingAlert | null; hidden: boolean; onClose: () => void }>) {
  const pathname = usePathname();
  const [open, setOpen] = useState(Boolean(alert));
  const pendingSources = alert?.pendingSources ?? [];

  if (!alert || hidden || !open || pathname !== "/dashboard") return null;

  const close = () => { setOpen(false); onClose(); };
  return <div className="fixed inset-0 z-50 flex items-end bg-slate-950/55 p-4 sm:items-center sm:justify-center" role="presentation"><section aria-labelledby="pending-report-title" aria-modal="true" className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl sm:p-6" role="dialog"><h2 id="pending-report-title" className="text-xl font-bold tracking-tight">Reporte de {formatReportDate(alert.reportDate)} pendente</h2><p className="mt-2 text-sm text-muted-foreground">O reporte de ontem ainda não foi concluído.</p><div className="mt-5 rounded-xl bg-muted p-4"><h3 className="font-semibold">Canais pendentes:</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{pendingSources.map((source) => <li key={source.id}>{source.name}</li>)}</ul></div><p className="mt-4 text-sm font-medium">Você possui {alert.pendingDaysThisMonth} {alert.pendingDaysThisMonth === 1 ? "dia pendente" : "dias pendentes"} neste mês.</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button className="min-h-11" onClick={close} type="button" variant="outline">Realizar depois</Button><Button asChild className="min-h-11"><Link href={`/reportes?data=${alert.reportDate}`}>Preencher agora</Link></Button></div></section></div>;
}

function ProductTour({ onComplete }: Readonly<{ onComplete: () => void }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<TourStep>(0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 16, width: 320 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeTarget = useRef<HTMLElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const sourceWasSaved = step === 7 && pathname === "/reportes" && searchParams.has("sucesso");
  const fallbackMessage = targetMissing && !sourceWasSaved ? getUnavailableTargetMessage(step) : null;

  useEffect(() => {
    if (step === 1 && pathname === "/reportes") setStep(2);
    if (step === 4 && pathname === "/reportes" && searchParams.get("origem")) setStep(5);
  }, [pathname, searchParams, step]);

  useEffect(() => {
    const advanceWhenContactsAreSelected = (event: Event) => {
      const input = event.target;
      if (step !== 5 || !(input instanceof HTMLInputElement) || !input.checked) return;
      if (input.id === "contacts-yes") setStep(6);
      if (input.id === "contacts-no") setStep(7);
    };
    document.addEventListener("change", advanceWhenContactsAreSelected);
    return () => document.removeEventListener("change", advanceWhenContactsAreSelected);
  }, [step]);

  useEffect(() => {
    if (!target || (step !== 0 && step !== 3)) return;
    const preventNavigationBeforeTheNextStep = (event: Event) => event.preventDefault();
    target.addEventListener("click", preventNavigationBeforeTheNextStep);
    return () => target.removeEventListener("click", preventNavigationBeforeTheNextStep);
  }, [step, target]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nextTarget = findTourTarget(step);
      activeTarget.current?.removeAttribute("data-tour-active");
      activeTarget.current = nextTarget;
      nextTarget?.setAttribute("data-tour-active", "true");
      setTarget(nextTarget);
      setTargetMissing(!nextTarget);
      nextTarget?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, searchParams, step]);

  useEffect(() => () => activeTarget.current?.removeAttribute("data-tour-active"), []);

  useEffect(() => {
    const updatePosition = () => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(360, viewportWidth - 32);
      const left = Math.min(Math.max(rect.left, 16), Math.max(16, viewportWidth - width - 16));
      const top = rect.bottom + 16 <= viewportHeight - 210 ? rect.bottom + 16 : Math.max(16, rect.top - 210);
      setPosition({ left, top, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => { window.removeEventListener("resize", updatePosition); window.removeEventListener("scroll", updatePosition, true); };
  }, [target]);

  const finish = async () => {
    setSaving(true);
    try {
      await completeClientOnboarding();
      onComplete();
    } catch {
      setError("Não foi possível concluir o tutorial. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };
  const content = sourceWasSaved ? { message: "Origem salva. Atualize as demais origens que se aplicarem ao dia quando necessário." } : tourContent[step];

  return <><div aria-hidden="true" className="fixed inset-0 z-50 bg-slate-950/60" onTouchEnd={() => { touchStartY.current = null; }} onTouchMove={(event) => { const touch = event.touches[0]; if (touchStartY.current !== null) { window.scrollBy({ top: touchStartY.current - touch.clientY }); touchStartY.current = touch.clientY; } }} onTouchStart={(event) => { touchStartY.current = event.touches[0]?.clientY ?? null; }} onWheel={(event) => window.scrollBy({ top: event.deltaY })} /><aside aria-live="polite" aria-modal="true" className="fixed z-[70] rounded-xl bg-card p-4 shadow-2xl" role="dialog" style={{ left: position.left, top: position.top, width: position.width }}><p className="text-sm leading-6 text-foreground">{fallbackMessage ?? content.message}</p>{fallbackMessage ? <p className="mt-2 text-sm text-muted-foreground">O tutorial foi interrompido porque a ação necessária não está disponível nesta tela.</p> : null}{error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}<div className="mt-4 flex flex-wrap justify-end gap-2">{content.nextLabel && !fallbackMessage ? <Button className="min-h-10" onClick={() => setStep((current) => (current + 1) as TourStep)} type="button">{content.nextLabel}</Button> : null}{(sourceWasSaved || fallbackMessage) ? <Button className="min-h-10" disabled={saving} onClick={finish} type="button">{saving ? "Finalizando..." : "Finalizar tutorial"}</Button> : null}</div></aside></>;
}

function getUnavailableTargetMessage(step: TourStep) {
  if (step === 4) return "Nenhuma origem disponível para esta data. Escolha outra data ou solicite à agência a configuração de uma origem aplicável.";
  if (step >= 5) return "A origem necessária para continuar o tutorial não está disponível para esta data.";
  return "A ação necessária para continuar o tutorial não está disponível nesta tela.";
}

function findTourTarget(step: TourStep): HTMLElement | null {
  if (step === 0) return document.querySelector<HTMLElement>('a[href^="/reportes?data="]');
  if (step === 1) return document.querySelector<HTMLElement>('a[href="/reportes"]');
  if (step === 2) return document.querySelector<HTMLElement>("#report-date-picker")?.parentElement ?? null;
  if (step === 3) return findElementByText("h3", "Origens do reporte")?.closest("div.rounded-xl") ?? null;
  if (step === 4) return document.querySelector<HTMLElement>('a[href*="origem="]');
  if (step === 5) return findElementByText("h2", "Houve contatos desta origem nesta data?")?.parentElement ?? null;
  if (step === 6) return findElementByText("h2", "Funil comercial")?.parentElement?.parentElement ?? null;
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')).find((button) => button.textContent?.includes("Salvar origem")) ?? null;
}

function findElementByText(selector: string, text: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => element.textContent?.trim() === text) ?? null;
}
