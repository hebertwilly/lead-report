"use server";

import { redirect } from "next/navigation";
import { resolveAuthIdentity } from "@/lib/auth/identity.server";
import { getSessionProfileForUserId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

export async function login(formData: FormData) {
  if (!hasSupabasePublicEnv()) redirect("/login?error=config");

  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!username.trim() || !password) redirect("/login?error=invalid");

  const identity = await resolveAuthIdentity(username);
  if (identity.kind === "not-found") redirect("/login?error=invalid");
  if (identity.kind === "unavailable") redirect("/login?error=config");
  if (identity.kind === "inconsistent") redirect("/login?error=unauthorized");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: identity.email, password });
  if (error) redirect("/login?error=invalid");

  const profileResolution = await getSessionProfileForUserId(identity.userId);
  if (profileResolution.kind === "resolution-unavailable") {
    throw new Error("Login autenticado, mas não foi possível resolver o perfil da sessão.");
  }
  if (profileResolution.kind !== "authenticated") {
    const signOut = await supabase.auth.signOut();
    if (signOut.error) await supabase.auth.signOut({ scope: "local" });
    redirect(profileResolution.kind === "profile-inactive" || profileResolution.kind === "client-inactive"
      ? "/login?error=inactive"
      : "/login?error=unauthorized");
  }

  redirect(profileResolution.profile.role === "ADMIN" ? "/admin" : "/dashboard");
}
