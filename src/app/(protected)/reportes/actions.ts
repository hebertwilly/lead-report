"use server";

import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/auth/guards";
import { OBJECTION_TYPES } from "@/lib/reports/constants";
import { isValidReportDate } from "@/lib/reports/date";
import type { SaveReportSourceState } from "@/lib/reports/save-report-source-state";
import { createClient } from "@/lib/supabase/server";
import type { ObjectionType } from "@/types";

function integerValue(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function decimalValue(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function saveReportSource(_previousState: SaveReportSourceState, formData: FormData): Promise<SaveReportSourceState> {
  await requireClient();
  const reportDate = String(formData.get("report-date") ?? "");
  const sourceId = String(formData.get("source-id") ?? "");
  const hadContacts = String(formData.get("had-contacts") ?? "");

  if (!isValidReportDate(reportDate)) return { error: "Escolha uma data válida, sem datas futuras." };
  if (!/^[0-9a-f-]{36}$/i.test(sourceId)) return { error: "A origem informada não é válida." };
  if (hadContacts !== "yes" && hadContacts !== "no") return { error: "Informe se houve contatos nesta origem." };

  const isNoContacts = hadContacts === "no";
  const leadsReceived = isNoContacts ? 0 : integerValue(formData, "leads-received");
  const leadsAnswered = isNoContacts ? 0 : integerValue(formData, "leads-answered");
  const leadsInterested = isNoContacts ? 0 : integerValue(formData, "leads-interested");
  const sales = isNoContacts ? 0 : integerValue(formData, "sales");
  const revenue = isNoContacts ? 0 : decimalValue(formData, "revenue");

  if (leadsReceived === null || leadsAnswered === null || leadsInterested === null || sales === null || revenue === null) {
    return { error: "Preencha as métricas com números válidos e não negativos." };
  }
  if (leadsAnswered > leadsReceived) return { error: "Leads respondidos não podem superar os leads recebidos." };
  if (leadsInterested > leadsAnswered) return { error: "Leads interessados não podem superar os respondidos." };
  if (sales > leadsInterested) return { error: "Vendas realizadas não podem superar os leads interessados." };
  if (sales > 0 && revenue === 0) return { error: "Informe o faturamento das vendas realizadas." };

  const objections: Array<{ type: ObjectionType; quantity: number }> = [];
  for (const objection of OBJECTION_TYPES) {
    const quantity = isNoContacts ? 0 : integerValue(formData, `objection-${objection.type}`);
    if (quantity === null) return { error: "As quantidades dos motivos devem ser inteiros não negativos." };
    objections.push({ type: objection.type, quantity });
  }

  const hasOtherCity = isNoContacts ? "no" : String(formData.get("has-other-city") ?? "");
  if (hasOtherCity !== "yes" && hasOtherCity !== "no") return { error: "Informe se houve vendas com envio para outra cidade." };
  const cityCount = isNoContacts ? 0 : integerValue(formData, "shipping-count");
  if (cityCount === null || cityCount > 30) return { error: "Revise as cidades de envio informadas." };
  if (hasOtherCity === "yes" && cityCount === 0) return { error: "Adicione ao menos uma cidade de envio." };
  const shippingCities: Array<{ city: string; state: string; quantity: number }> = [];
  for (let index = 0; index < cityCount; index += 1) {
    const city = String(formData.get(`shipping-city-${index}`) ?? "").trim();
    const state = String(formData.get(`shipping-state-${index}`) ?? "").trim().toUpperCase();
    const quantity = integerValue(formData, `shipping-quantity-${index}`);
    if (!city || !/^[A-Z]{2}$/.test(state) || quantity === null || quantity < 1) {
      return { error: "Informe cidade, UF e quantidade válida em cada envio." };
    }
    shippingCities.push({ city, state, quantity });
  }
  const shippingTotal = shippingCities.reduce((total, city) => total + city.quantity, 0);
  if (shippingTotal > sales) return { error: "A soma das vendas por cidade não pode superar as vendas realizadas." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_daily_report_source", {
    p_report_date: reportDate,
    p_lead_source_id: sourceId,
    p_status: isNoContacts ? "NO_CONTACTS" : "FILLED",
    p_leads_received: leadsReceived,
    p_leads_answered: leadsAnswered,
    p_leads_interested: leadsInterested,
    p_sales: sales,
    p_revenue: revenue,
    p_notes: String(formData.get("notes") ?? ""),
    p_objections: objections,
    p_shipping_cities: shippingCities,
  } as never);

  if (error) return { error: "Não foi possível salvar o reporte. Tente novamente." };
  revalidatePath("/dashboard");
  revalidatePath("/reportes");
  revalidatePath("/historico");
  return { success: true };
}
