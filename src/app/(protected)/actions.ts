"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { requireClient } from "@/lib/auth/guards";

export async function completeClientOnboarding() {
  await requireClient();
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_client_onboarding");

  if (error) throw new Error("Não foi possível concluir o tutorial.");
}

export async function logout() {
  if (hasSupabasePublicEnv()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      const localSignOut = await supabase.auth.signOut({ scope: "local" });
      if (localSignOut.error) throw new Error("Não foi possível encerrar a sessão.");
    }
  }
  redirect("/login");
}
