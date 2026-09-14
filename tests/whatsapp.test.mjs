import test from "node:test";
import assert from "node:assert/strict";
import { buildPendingReportMessage, buildWhatsAppUrl, normalizeWhatsAppPhone } from "../src/lib/whatsapp/index.ts";

const appUrl = "https://lead-report.example";

test("normaliza número brasileiro com DDD e sem DDI", () => {
  assert.equal(normalizeWhatsAppPhone("(11) 99999-9999"), "5511999999999");
});

test("preserva número que já possui DDI", () => {
  assert.equal(normalizeWhatsAppPhone("+55 11 99999-9999"), "5511999999999");
});

test("gera a mensagem para uma pendência", () => {
  assert.equal(
    buildPendingReportMessage(["2026-09-10"], appUrl),
    `Olá, pessoal! Tudo bem?\n\nIdentificamos que o reporte referente ao dia 10/09/2026 ainda está pendente no Lead Report.\n\nQuando possível, peço que realizem o preenchimento para mantermos o acompanhamento dos resultados comerciais atualizado.\n\nAcesso à plataforma:\n${appUrl}\n\nObrigado!`,
  );
});

test("gera a mensagem para várias pendências usando a data mais antiga", () => {
  const message = buildPendingReportMessage(["2026-09-10", "2026-09-08", "2026-09-09"], appUrl);
  assert.equal(
    message,
    `Olá, pessoal! Tudo bem?\n\nIdentificamos que existem 3 dias de reporte pendentes no Lead Report, sendo o mais antigo referente ao dia 08/09/2026.\n\nQuando possível, peço que realizem o preenchimento para mantermos o acompanhamento dos resultados comerciais atualizado.\n\nAcesso à plataforma:\n${appUrl}\n\nObrigado!`,
  );
});

test("gera URL wa.me com a mensagem corretamente codificada", () => {
  const message = buildPendingReportMessage(["2026-09-10"], appUrl);
  assert.equal(
    buildWhatsAppUrl("5511999999999", message),
    `https://wa.me/5511999999999?text=${encodeURIComponent(message ?? "")}`,
  );
});

test("sem WhatsApp não gera URL de conversa", () => {
  const message = buildPendingReportMessage(["2026-09-10"], appUrl);
  assert.equal(normalizeWhatsAppPhone(""), null);
  assert.equal(buildWhatsAppUrl(null, message), null);
});

test("sem pendências não gera mensagem nem URL de cobrança", () => {
  const message = buildPendingReportMessage([], appUrl);
  assert.equal(message, null);
  assert.equal(buildWhatsAppUrl("5511999999999", message), null);
});
