"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { isValidUsername, normalizeUsername, usernameToTechnicalEmail } from "@/lib/auth/identity.server";
import { isClientGoalMetricType, isCurrencyGoalMetric } from "@/lib/goals/constants";
import { parseClientGoalValue } from "@/lib/goals/validation";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { createClient } from "@/lib/supabase/server";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const go = (path: string, value: string, error = false): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${error ? "erro" : "sucesso"}=${encodeURIComponent(value)}`);

type ManagedSourceDraft = { name: string; key: string; active: boolean; primary: boolean; sortOrder: number };
type FormSourceDraft = { name: unknown; active: unknown; primary: unknown };

function normalizeSourceName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

function parseManagedSources(value: FormDataEntryValue | null): ManagedSourceDraft[] | null {
  if (typeof value !== "string") return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const sources = parsed.map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const source = item as FormSourceDraft;
      if (typeof source.name !== "string" || typeof source.active !== "boolean" || typeof source.primary !== "boolean") return null;
      const name = source.name.trim();
      const key = normalizeUsername(name);
      if (!name || !slugPattern.test(key)) return null;
      return { name, key, active: source.active, primary: source.primary && source.active, sortOrder: index };
    });
    if (sources.some((source) => !source)) return null;

    const validSources = sources as ManagedSourceDraft[];
    const names = validSources.map((source) => normalizeSourceName(source.name));
    const keys = validSources.map((source) => source.key);
    if (!validSources.some((source) => source.active) || new Set(names).size !== names.length || new Set(keys).size !== keys.length) return null;
    if (validSources.filter((source) => source.active && source.primary).length > 1) return null;
    return validSources;
  } catch {
    return null;
  }
}

async function findAuthUserByTechnicalEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage });
    if (result.error) return { userExists: false, failed: true };
    if (result.data.users.some((user) => user.email === email)) return { userExists: true, failed: false };
    if (result.data.users.length < perPage) return { userExists: false, failed: false };
  }
}

async function usernameIsAlreadyUsed(admin: ReturnType<typeof createAdminClient>, username: string) {
  const [client, profile, auth] = await Promise.all([
    admin.from("clients").select("id").eq("slug", username).maybeSingle(),
    admin.from("profiles").select("id").eq("login_username", username).maybeSingle(),
    findAuthUserByTechnicalEmail(admin, usernameToTechnicalEmail(username)),
  ]);
  return { used: Boolean(client.data || profile.data || auth.userExists), failed: Boolean(client.error || profile.error || auth.failed) };
}

export async function createManagedClient(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("password-confirmation") ?? "");
  const whatsappInput = String(formData.get("whatsapp-phone") ?? "");
  const whatsappPhone = normalizeWhatsAppPhone(whatsappInput);
  const active = formData.get("active") === "on";
  const sources = parseManagedSources(formData.get("sources"));

  if (!name || !isValidUsername(username) || password.length < 8) return go("/admin/clientes", "Revise os dados informados e use uma senha de pelo menos 8 caracteres.", true);
  if (password !== passwordConfirmation) return go("/admin/clientes", "As senhas não coincidem.", true);
  if (whatsappInput.trim() && !whatsappPhone) return go("/admin/clientes", "Informe um WhatsApp válido com DDD, sem inventar o DDD.", true);
  if (!sources) return go("/admin/clientes", "Revise as origens: mantenha uma ativa, sem nomes duplicados e com no máximo uma principal ativa.", true);

  const admin = createAdminClient();
  const availability = await usernameIsAlreadyUsed(admin, username);
  if (availability.used) return go("/admin/clientes", "Este username já está sendo utilizado.", true);
  if (availability.failed) return go("/admin/clientes", "Não foi possível validar o username agora. Tente novamente.", true);

  const auth = await admin.auth.admin.createUser({ email: usernameToTechnicalEmail(username), password, email_confirm: true });
  if (auth.error || !auth.data.user) return go("/admin/clientes", "Este username já está sendo utilizado.", true);

  const user = auth.data.user;
  const provision = await admin.rpc("provision_client_with_access", {
    p_auth_user_id: user.id,
    p_name: name,
    p_username: username,
    p_active: active,
    p_sources: sources.map((source) => ({ name: source.name, key: source.key, active: source.active, primary: source.primary, sortOrder: source.sortOrder })),
    p_whatsapp_phone: whatsappPhone,
  });

  if (provision.error || !provision.data) {
    const rollback = await admin.auth.admin.deleteUser(user.id);
    if (rollback.error) return go("/admin/clientes", "O cliente não foi criado, mas a identidade de acesso precisa de revisão administrativa antes de reutilizar o username.", true);
    if (provision.error?.code === "23505") return go("/admin/clientes", "Este username já está sendo utilizado.", true);
    return go("/admin/clientes", "O cadastro foi revertido porque não foi possível configurar o cliente e suas origens.", true);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/clientes");
  redirect(`/admin/clientes/${provision.data}?sucesso=${encodeURIComponent(`Cliente criado. Username de login: ${username}.`)}`);
}

export async function updateManagedClientInformation(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("client-id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const whatsappInput = String(formData.get("whatsapp-phone") ?? "");
  const whatsappPhone = normalizeWhatsAppPhone(whatsappInput);
  const path = `/admin/clientes/${clientId}?view=settings`;
  if (!clientId || !name) go(path, "Informe o nome do cliente.", true);
  if (whatsappInput.trim() && !whatsappPhone) go(path, "Informe um WhatsApp válido com DDD, sem inventar o DDD.", true);

  const supabase = await createClient();
  const updated = await supabase.from("clients").update({ name, whatsapp_phone: whatsappPhone }).eq("id", clientId);
  if (updated.error) go(path, "Não foi possível atualizar as informações do cliente.", true);
  revalidatePath("/admin");
  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${clientId}`);
  go(path, "Informações do cliente atualizadas.");
}

export async function resetManagedClientPassword(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("client-id") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("password-confirmation") ?? "");
  const path = `/admin/clientes/${clientId}?view=settings`;
  if (!clientId || password.length < 8) go(path, "Informe uma senha com ao menos 8 caracteres.", true);
  if (password !== passwordConfirmation) go(path, "As senhas não coincidem.", true);
  const admin = createAdminClient();
  const result = await admin.from("profiles").select("id").eq("client_id", clientId).eq("role", "CLIENT").maybeSingle();
  if (!result.data) return go("/admin", "Cliente não encontrado.", true);
  const updated = await admin.auth.admin.updateUserById(result.data.id, { password });
  if (updated.error) go(path, "Não foi possível redefinir a senha.", true);
  go(path, "Senha redefinida com sucesso.");
}

export async function setManagedClientActive(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("client-id") ?? "");
  const active = formData.get("active") === "true";
  const path = `/admin/clientes/${clientId}?view=settings`;
  const supabase = await createClient();
  const [client, profile] = await Promise.all([
    supabase.from("clients").update({ active }).eq("id", clientId),
    supabase.from("profiles").update({ active }).eq("client_id", clientId).eq("role", "CLIENT"),
  ]);
  if (client.error || profile.error) go(path, "Não foi possível atualizar o acesso.", true);
  revalidatePath("/admin");
  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${clientId}`);
  go(path, active ? "Cliente reativado." : "Cliente desativado.");
}

export async function saveLeadSource(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("client-id") ?? "");
  const sourceId = String(formData.get("source-id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const active = formData.get("active") === "on";
  const primary = active && formData.get("primary") === "on";
  const path = `/admin/clientes/${clientId}?view=settings`;
  if (!uuidPattern.test(clientId) || (sourceId && !uuidPattern.test(sourceId)) || !name || name.length > 120) {
    go(path, "Informe um nome válido para a origem.", true);
  }

  const supabase = await createClient();
  const saved = await supabase.rpc("save_lead_source_configuration", {
    p_client_id: clientId,
    p_source_id: sourceId || null,
    p_name: name,
    p_is_active: active,
    p_is_primary: primary,
  } as never);
  if (saved.error?.code === "23505") go(path, "Já existe uma origem ativa com esse nome.", true);
  if (saved.error?.code === "22023") go(path, saved.error.message, true);
  if (saved.error) go(path, "Não foi possível salvar a origem.", true);
  revalidatePath("/admin");
  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${clientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reportes");
  revalidatePath("/historico");
  go(path, "Origem salva com sucesso.");
}

function revalidateClientGoals(clientId: string) {
  revalidatePath(`/admin/clientes/${clientId}`);
}

export async function createClientGoal(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("client-id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const metricValue = String(formData.get("metric-type") ?? "");
  const metricType = isClientGoalMetricType(metricValue) ? metricValue : null;
  const path = `/admin/clientes/${clientId}?view=settings`;

  if (!uuidPattern.test(clientId) || !name || name.length > 120) {
    go(path, "Revise o nome e o tipo da meta.", true);
  }
  if (!metricType) return go(path, "Selecione um tipo de meta válido.", true);

  const targetValue = parseClientGoalValue(formData.get("target-value"), metricType);
  if (targetValue === null) {
    go(path, isCurrencyGoalMetric(metricType)
      ? "Informe um valor monetário maior que zero, com no máximo duas casas decimais."
      : "Informe uma quantidade inteira maior que zero.", true);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("client_goals").insert({
    client_id: clientId,
    name,
    metric_type: metricType,
    target_value: targetValue,
    active: true,
  } as never);

  if (error?.code === "23505") go(path, "Este cliente já possui uma meta ativa para esse tipo.", true);
  if (error) go(path, "Não foi possível adicionar a meta do cliente.", true);
  revalidateClientGoals(clientId);
  go(path, "Meta adicionada com sucesso.");
}

export async function updateClientGoal(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("client-id") ?? "");
  const goalId = String(formData.get("goal-id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const active = formData.get("active") === "on";
  const path = `/admin/clientes/${clientId}?view=settings`;

  if (!uuidPattern.test(clientId) || !uuidPattern.test(goalId) || !name || name.length > 120) {
    go(path, "Revise os dados da meta.", true);
  }

  const supabase = await createClient();
  const goalResult = await supabase
    .from("client_goals")
    .select("metric_type")
    .eq("id", goalId)
    .eq("client_id", clientId)
    .maybeSingle();

  const metricValue = (goalResult.data as { metric_type?: string } | null)?.metric_type ?? "";
  const metricType = isClientGoalMetricType(metricValue) ? metricValue : null;
  if (goalResult.error) go(path, "Não foi possível localizar a meta.", true);
  if (!metricType) return go(path, "Meta não encontrada.", true);

  const targetValue = parseClientGoalValue(formData.get("target-value"), metricType);
  if (targetValue === null) {
    go(path, isCurrencyGoalMetric(metricType)
      ? "Informe um valor monetário maior que zero, com no máximo duas casas decimais."
      : "Informe uma quantidade inteira maior que zero.", true);
  }

  const updated = await supabase
    .from("client_goals")
    .update({ name, target_value: targetValue, active } as never)
    .eq("id", goalId)
    .eq("client_id", clientId)
    .select("id")
    .maybeSingle();

  if (updated.error?.code === "23505") go(path, "Não é possível reativar: já existe outra meta ativa para esse tipo.", true);
  if (updated.error || !updated.data) go(path, "Não foi possível atualizar a meta.", true);
  revalidateClientGoals(clientId);
  go(path, active ? "Meta atualizada com sucesso." : "Meta desativada e mantida no histórico.");
}
