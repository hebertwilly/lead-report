import type { ObjectionType, ReportSourceStatus } from "@/types";

export const OBJECTION_TYPES: ReadonlyArray<{ type: ObjectionType; label: string }> = [
  { type: "NO_RESPONSE", label: "Não respondeu / parou de responder" },
  { type: "PRICE", label: "Preço" },
  { type: "SHIPPING", label: "Frete" },
  { type: "PRODUCT_UNAVAILABLE", label: "Produto indisponível" },
  { type: "PAYMENT_METHOD", label: "Forma de pagamento" },
  { type: "THINKING", label: "Ainda está pensando" },
  { type: "NO_INTEREST", label: "Sem interesse" },
  { type: "OTHER", label: "Outros" },
];

export const SOURCE_STATUS_LABEL: Record<ReportSourceStatus, string> = {
  PENDING: "Pendente",
  FILLED: "Preenchido",
  NO_CONTACTS: "Sem contatos",
};
