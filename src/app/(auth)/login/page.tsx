import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getCurrentSessionResolution, getSessionHomePath } from "@/lib/auth/session";

type LoginPageProps = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ error }, resolution] = await Promise.all([searchParams, getCurrentSessionResolution()]);

  if (resolution.kind === "authenticated") redirect(getSessionHomePath(resolution.profile));
  if (resolution.kind === "auth-unavailable") {
    throw new Error(`Não foi possível validar a sessão no Supabase: ${resolution.error.message}`);
  }
  if (resolution.kind === "resolution-unavailable") {
    throw new Error("Não foi possível resolver o perfil da sessão.");
  }
  if (resolution.kind !== "unauthenticated") {
    const reason = resolution.kind === "profile-inactive" || resolution.kind === "client-inactive" ? "inactive" : "unauthorized";
    redirect(`/auth/session-invalid?reason=${reason}`);
  }

  return <AuthLayout><LoginForm error={error} /></AuthLayout>;
}
