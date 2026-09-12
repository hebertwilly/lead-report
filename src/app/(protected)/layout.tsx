import { ClientExperience } from "@/components/onboarding/client-experience";
import { AdminPageHeader } from "@/components/layout/admin-page-header";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { getTodayInSaoPaulo } from "@/lib/reports/date";
import { getPreviousDayPendingAlert } from "@/lib/reports/data.server";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireAuthenticatedUser();
  const pendingAlert = profile.role === "CLIENT" && profile.onboardingCompletedAt
    ? await getPreviousDayPendingAlert(profile.clientId!, profile.client!.reportingStartedAt, getTodayInSaoPaulo())
    : null;

  if (profile.role !== "CLIENT") return <div className="min-h-screen"><AdminPageHeader username={profile.username} />{children}</div>;

  return <main className="min-h-screen"><ClientExperience onboardingCompleted={Boolean(profile.onboardingCompletedAt)} pendingAlert={pendingAlert}>{children}</ClientExperience></main>;
}
