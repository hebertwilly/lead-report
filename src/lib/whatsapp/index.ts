const WHATSAPP_PHONE_PATTERN = /^[1-9]\d{9,14}$/;
const BRAZIL_COUNTRY_CODE = "55";

/**
 * Normaliza um telefone para o formato internacional usado pelo WhatsApp.
 * Números brasileiros com DDD, mas sem DDI, recebem o prefixo 55.
 */
export function normalizeWhatsAppPhone(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  if (!/^\+?[\d\s().-]+$/.test(input)) return null;

  const digits = input.replace(/\D/g, "");
  const hasExplicitCountryCode = input.startsWith("+");
  const normalized = !hasExplicitCountryCode && (digits.length === 10 || digits.length === 11)
    ? `${BRAZIL_COUNTRY_CODE}${digits}`
    : digits;

  if (/^55\d{10,11}$/.test(normalized) && !/^55[1-9]\d/.test(normalized)) return null;
  return WHATSAPP_PHONE_PATTERN.test(normalized) ? normalized : null;
}

export function formatWhatsAppPhone(phone: string | null) {
  if (!phone) return "Não cadastrado";
  const brazilianMatch = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (!brazilianMatch) return `+${phone}`;
  const [, areaCode, firstPart, lastPart] = brazilianMatch;
  return `+55 (${areaCode}) ${firstPart}-${lastPart}`;
}

function formatPendingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("A data pendente deve usar o formato YYYY-MM-DD.");
  }
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/** Retorna null quando não existem pendências, evitando mensagens enganosas. */
export function buildPendingReportMessage(pendingDates: readonly string[], appUrl: string): string | null {
  const dates = [...new Set(pendingDates)].sort();
  if (!dates.length) return null;

  const oldestDate = formatPendingDate(dates[0]);
  const pendingParagraph = dates.length === 1
    ? `Identificamos que o reporte referente ao dia ${oldestDate} ainda está pendente no Lead Report.`
    : `Identificamos que existem ${dates.length} dias de reporte pendentes no Lead Report, sendo o mais antigo referente ao dia ${oldestDate}.`;

  return `Olá, pessoal! Tudo bem?\n\n${pendingParagraph}\n\nQuando possível, peço que realizem o preenchimento para mantermos o acompanhamento dos resultados comerciais atualizado.\n\nAcesso à plataforma:\n${appUrl}\n\nObrigado!`;
}

export function buildWhatsAppUrl(phone: string | null, message: string | null): string | null {
  if (!phone || !message || !WHATSAPP_PHONE_PATTERN.test(phone)) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
