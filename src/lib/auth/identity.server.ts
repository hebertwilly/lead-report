import "server-only";

import { normalizeUsername } from "@/lib/auth/username";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { hasSupabaseAdminEnv } from "@/lib/supabase/env";

const TECHNICAL_AUTH_DOMAIN = "auth.internal";
export { isValidUsername, normalizeUsername } from "@/lib/auth/username";

type AuthProfileRow = { id: string; username: string };

export type AuthIdentityResolution =
  | { kind: "resolved"; email: string; userId: string }
  | { kind: "not-found" }
  | { kind: "inconsistent" }
  | { kind: "unavailable" };

/** Server-only mapping; the technical e-mail must never be displayed in the UI. */
export function usernameToTechnicalEmail(username: string) {
  return `${username}@${TECHNICAL_AUTH_DOMAIN}`;
}

/**
 * Compatibilidade exclusiva de leitura para usernames criados antes da regra
 * atual, que ainda permitia ponto e sublinhado. Novos usernames nunca usam
 * este formato; a identidade definitiva continua sendo profiles.id.
 */
function normalizeLegacyUsername(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function findLegacyAuthUser(username: string) {
  const admin = createAdminClient();
  const technicalEmails = [usernameToTechnicalEmail(username)];

  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) return null;
    const user = result.data.users.find((candidate) => candidate.email && technicalEmails.includes(candidate.email));
    if (user) return user;
    if (result.data.users.length < 1000) return null;
  }
}

/**
 * Resolve a identidade de login no servidor. O e-mail técnico é obtido do
 * usuário Auth associado ao profile, e nunca é reconstruído para autenticar
 * perfis existentes. Isso mantém compatibilidade com usernames legados.
 */
export async function resolveAuthIdentity(usernameInput: string): Promise<AuthIdentityResolution> {
  if (!hasSupabaseAdminEnv()) return { kind: "unavailable" };

  const username = normalizeUsername(usernameInput);
  if (!username) return { kind: "not-found" };

  const admin = createAdminClient();
  const profileResult = await admin
    .from("profiles")
    .select("id, username")
    .eq("login_username", username)
    .maybeSingle();

  let profile = profileResult.data as AuthProfileRow | null;

  // Permite subir a aplicação antes da migration sem derrubar logins já
  // existentes. A migration adiciona login_username para a resolução canônica.
  if (profileResult.error) {
    const legacyUsername = normalizeLegacyUsername(usernameInput);
    const candidates = [...new Set([username, legacyUsername].filter(Boolean))];
    const fallback = await admin.from("profiles").select("id, username").in("username", candidates);
    if (fallback.error) return { kind: "unavailable" };
    if (fallback.data.length !== 1) {
      const authUser = await findLegacyAuthUser(legacyUsername);
      return authUser ? { kind: "inconsistent" } : { kind: "not-found" };
    }
    profile = fallback.data[0] as AuthProfileRow;
  }

  if (!profile) {
    const authUser = await findLegacyAuthUser(normalizeLegacyUsername(usernameInput));
    return authUser ? { kind: "inconsistent" } : { kind: "not-found" };
  }

  const authResult = await admin.auth.admin.getUserById(profile.id);
  const email = authResult.data.user?.email;
  if (authResult.error || !email) return { kind: "inconsistent" };

  return { kind: "resolved", email, userId: profile.id };
}
