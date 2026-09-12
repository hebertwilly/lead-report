import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSessionResolution, getSessionHomePath } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const resolution = await getCurrentSessionResolution();

  // Abrir esta rota diretamente nunca encerra uma sessão válida.
  if (resolution.kind === "authenticated") {
    return NextResponse.redirect(new URL(getSessionHomePath(resolution.profile), request.url));
  }
  if (resolution.kind === "auth-unavailable") {
    throw new Error(`Não foi possível validar a sessão no Supabase: ${resolution.error.message}`);
  }
  if (resolution.kind === "resolution-unavailable") {
    throw new Error("Não foi possível resolver o perfil da sessão.");
  }

  if (hasSupabasePublicEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }

  const error = resolution.kind === "profile-inactive" || resolution.kind === "client-inactive" ? "inactive" : "unauthorized";
  return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
}
