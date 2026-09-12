import "server-only";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { hasSupabaseAdminEnv, hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { UserRole } from "@/types";

type ClientSummary = { id: string; name: string; slug: string; active: boolean; reporting_started_at: string };
type ProfileRow = { id: string; username: string; role: UserRole; active: boolean; client_id: string | null; onboarding_completed_at: string | null };

export type SessionProfile = {
  id: string;
  username: string;
  role: UserRole;
  clientId: string | null;
  client: { id: string; name: string; slug: string; active: boolean; reportingStartedAt: string } | null;
  onboardingCompletedAt: string | null;
};

export type SessionProfileResolution =
  | { kind: "authenticated"; profile: SessionProfile }
  | { kind: "profile-missing" }
  | { kind: "profile-inactive" }
  | { kind: "client-inactive" }
  | { kind: "inconsistent" }
  | { kind: "resolution-unavailable"; operation: "profile" | "client" };

type SessionAuthError = { message: string; status?: number; code?: string };

export type CurrentSessionResolution = SessionProfileResolution
  | { kind: "unauthenticated"; error: SessionAuthError | null }
  | { kind: "auth-unavailable"; error: SessionAuthError };

export async function getSessionProfileForUserId(userId: string): Promise<SessionProfileResolution> {
  // userId vem de auth.getUser/signInWithPassword. A leitura privilegiada
  // permite distinguir CLIENT inativo de linha inconsistente mesmo quando a
  // RLS oculta intencionalmente o cliente inativo.
  if (!hasSupabaseAdminEnv()) return { kind: "resolution-unavailable", operation: "profile" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, role, active, client_id, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) return { kind: "resolution-unavailable", operation: "profile" };

  const profile = data as unknown as ProfileRow | null;
  if (!profile) return { kind: "profile-missing" };
  if (!profile.active) return { kind: "profile-inactive" };

  if (profile.role === "ADMIN") {
    if (profile.client_id) return { kind: "inconsistent" };
    return {
      kind: "authenticated",
      profile: {
        id: profile.id,
        username: profile.username,
        role: profile.role,
        clientId: null,
        client: null,
        onboardingCompletedAt: profile.onboarding_completed_at,
      },
    };
  }

  if (profile.role !== "CLIENT" || !profile.client_id) return { kind: "inconsistent" };

  const { data: clientData, error: clientError } = await admin
    .from("clients")
    .select("id, name, slug, active, reporting_started_at")
    .eq("id", profile.client_id)
    .maybeSingle();
  if (clientError) return { kind: "resolution-unavailable", operation: "client" };
  const client = clientData as unknown as ClientSummary | null;
  if (!client) return { kind: "inconsistent" };
  if (!client.active) return { kind: "client-inactive" };

  return {
    kind: "authenticated",
    profile: {
      id: profile.id,
      username: profile.username,
      role: profile.role,
      clientId: profile.client_id,
      client: { id: client.id, name: client.name, slug: client.slug, active: client.active, reportingStartedAt: client.reporting_started_at },
      onboardingCompletedAt: profile.onboarding_completed_at,
    },
  };
}

function getAuthError(error: { message: string; status?: number; code?: string }): SessionAuthError {
  return { message: error.message, status: error.status, code: error.code };
}

export async function getCurrentSessionResolution(): Promise<CurrentSessionResolution> {
  if (!hasSupabasePublicEnv()) {
    return { kind: "auth-unavailable", error: { message: "Configuração pública do Supabase indisponível." } };
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    const authError = getAuthError(error);
    if (isAuthRetryableFetchError(error) || error.status === 429 || (error.status !== undefined && error.status >= 500)) {
      return { kind: "auth-unavailable", error: authError };
    }
    return { kind: "unauthenticated", error: authError };
  }
  if (!user) return { kind: "unauthenticated", error: null };
  return getSessionProfileForUserId(user.id);
}

export async function getCurrentSessionProfile(): Promise<SessionProfile | null> {
  const resolution = await getCurrentSessionResolution();
  return resolution.kind === "authenticated" ? resolution.profile : null;
}

export function getSessionHomePath(profile: SessionProfile) {
  return profile.role === "ADMIN" ? "/admin" : "/dashboard";
}
