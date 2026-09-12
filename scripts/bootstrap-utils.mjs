import { createClient } from "@supabase/supabase-js";

const usernamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const technicalAuthDomain = "auth.internal";

export function getRequiredEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.LEAD_REPORT_BOOTSTRAP_PASSWORD;
  if (!url || !serviceRoleKey || !password) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e LEAD_REPORT_BOOTSTRAP_PASSWORD somente no processo deste comando.");
  }
  return { supabase: createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }), password };
}

export function getOption(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function normalizeUsername(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function assertUsername(value) {
  const username = normalizeUsername(value);
  if (username.length < 3 || username.length > 63) throw new Error("Username inválido. Use entre 3 e 63 caracteres.");
  if (!usernamePattern.test(username)) throw new Error("Username inválido. Use 3–63 caracteres: letras minúsculas, números e hífen.");
  return username;
}

export function technicalEmail(username) {
  return `${username}@${technicalAuthDomain}`;
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/(authorization|bearer|token|password|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]");
}

export function formatSupabaseError(error) {
  if (!error || typeof error !== "object") return "Erro desconhecido retornado pelo Supabase.";

  const fields = [
    ["código", error.code],
    ["mensagem", error.message],
    ["detalhes", error.details],
    ["dica", error.hint],
    ["status", error.status],
  ];

  const details = fields
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `${label}: ${redactSensitiveText(value)}`);

  return details.length > 0 ? details.join("; ") : "Erro desconhecido retornado pelo Supabase.";
}

async function findAuthUserByEmail(supabase, email) {
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Não foi possível consultar os usuários Auth. ${formatSupabaseError(error)}`);

    const user = data.users.find((candidate) => candidate.email === email);
    if (user) return user;

    if (data.users.length < perPage) return null;
    page += 1;
  }
}

export async function findAuthUserByUsername(supabase, username) {
  return findAuthUserByEmail(supabase, technicalEmail(username));
}

export async function findProfileByLoginUsername(supabase, username) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, login_username, role, client_id, active")
    .eq("login_username", username)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível consultar o profile pelo username de login. ${formatSupabaseError(error)}`);
  return data;
}

export async function findOrCreateAuthUser(supabase, username, password) {
  const existingUser = await findAuthUserByUsername(supabase, username);
  if (existingUser) return { user: existingUser, created: false };

  try {
    const user = await createAuthUser(supabase, username, password);
    return { user, created: true };
  } catch (error) {
    const userCreatedConcurrently = await findAuthUserByUsername(supabase, username);
    if (userCreatedConcurrently) return { user: userCreatedConcurrently, created: false };
    throw error;
  }
}

export async function createAuthUser(supabase, username, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: technicalEmail(username),
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Não foi possível criar o usuário de autenticação. ${formatSupabaseError(error)}`);
  return data.user;
}
