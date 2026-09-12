import "server-only";
import { redirect } from "next/navigation";
import { getCurrentSessionResolution } from "@/lib/auth/session";

export async function requireAuthenticatedUser() {
  const resolution = await getCurrentSessionResolution();
  if (resolution.kind === "authenticated") return resolution.profile;

  // Falha transitória de Auth ou da consulta auxiliar de profile não prova
  // que a sessão é inválida e, portanto, nunca deve limpar seus cookies.
  if (resolution.kind === "auth-unavailable") {
    throw new Error(`Não foi possível validar a sessão no Supabase: ${resolution.error.message}`);
  }
  if (resolution.kind === "resolution-unavailable") {
    throw new Error("Não foi possível resolver o perfil da sessão.");
  }

  const reason = resolution.kind === "profile-inactive" || resolution.kind === "client-inactive" ? "inactive" : "unauthorized";
  redirect(`/auth/session-invalid?reason=${reason}`);
}

export async function requireAdmin() {
  const profile = await requireAuthenticatedUser();
  if (profile.role !== "ADMIN") redirect("/dashboard");
  return profile;
}

export async function requireClient() {
  const profile = await requireAuthenticatedUser();
  if (profile.role !== "CLIENT") redirect("/admin");
  return profile;
}
