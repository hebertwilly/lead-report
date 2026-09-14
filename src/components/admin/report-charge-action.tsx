"use client";

import { Check, CheckCircle2, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatReportDate } from "@/lib/reports/date";
import { buildPendingReportMessage, buildWhatsAppUrl } from "@/lib/whatsapp";

type CopyFeedback = "idle" | "copied" | "error";

export function ReportChargeAction({
  appUrl,
  pendingDates,
  whatsappPhone,
}: Readonly<{
  appUrl: string;
  pendingDates: string[];
  whatsappPhone: string | null;
}>) {
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>("idle");
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const message = buildPendingReportMessage(pendingDates, appUrl);
  const whatsappUrl = buildWhatsAppUrl(whatsappPhone, message);
  const oldestPendingDate = [...pendingDates].sort()[0] ?? null;

  useEffect(() => () => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
  }, []);

  async function copyMessage() {
    if (!message) return;

    try {
      await navigator.clipboard.writeText(message);
      setCopyFeedback("copied");
    } catch {
      setCopyFeedback("error");
    }

    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => setCopyFeedback("idle"), 2500);
  }

  if (!message || !oldestPendingDate) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
        <CheckCircle2 aria-hidden="true" className="size-4" />
        Reportes em dia
      </p>
    );
  }

  const pendingLabel = pendingDates.length === 1
    ? "1 reporte pendente"
    : `${pendingDates.length} reportes pendentes`;

  return (
    <div className="w-full space-y-1.5 sm:w-auto sm:text-right">
      {whatsappUrl ? (
        <Button asChild className="min-h-11 w-full sm:w-auto" variant="outline">
          <a href={whatsappUrl} rel="noopener noreferrer" target="_blank">
            <MessageCircle aria-hidden="true" className="mr-2 size-4" />
            Solicitar reporte
          </a>
        </Button>
      ) : (
        <Button className="min-h-11 w-full sm:w-auto" onClick={copyMessage} type="button" variant="outline">
          {copyFeedback === "copied" ? <Check aria-hidden="true" className="mr-2 size-4" /> : <MessageCircle aria-hidden="true" className="mr-2 size-4" />}
          {copyFeedback === "copied" ? "Mensagem copiada" : "Solicitar reporte"}
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        {pendingLabel} · desde {formatReportDate(oldestPendingDate)}
        {!whatsappPhone ? " · WhatsApp não cadastrado" : ""}
      </p>
      <p aria-live="polite" className="sr-only" role="status">
        {copyFeedback === "copied" ? "Mensagem copiada" : copyFeedback === "error" ? "Não foi possível copiar a mensagem." : ""}
      </p>
    </div>
  );
}
