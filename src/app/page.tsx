import { redirect } from "next/navigation";
import { getCurrentSessionResolution, getSessionHomePath } from "@/lib/auth/session";

export default async function HomePage() {
  const resolution = await getCurrentSessionResolution();

  if (resolution.kind === "authenticated") redirect(getSessionHomePath(resolution.profile));
  if (resolution.kind === "unauthenticated") redirect("/login");
  if (resolution.kind === "auth-unavailable") {
    throw new Error(`Não foi possível validar a sessão no Supabase: ${resolution.error.message}`);
  }
  if (resolution.kind === "resolution-unavailable") {
    throw new Error("Não foi possível resolver o perfil da sessão.");
  }

  const reason = resolution.kind === "profile-inactive" || resolution.kind === "client-inactive" ? "inactive" : "unauthorized";
  redirect(`/auth/session-invalid?reason=${reason}`);
}
