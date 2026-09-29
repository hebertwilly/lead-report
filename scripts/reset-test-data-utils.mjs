export const MASTER_USERNAME = "mestre";
export const RESET_CONFIRMATION = "RESET CLIENT DATA";

export const CLIENT_DATA_COUNT_KEYS = [
  "objections",
  "shipping_cities",
  "report_sources",
  "daily_reports",
  "lead_source_active_periods",
  "lead_sources",
  "client_goals",
  "profiles_client",
  "clients",
];

export function buildIdentityPlan({ profiles, authUsers }) {
  const masterProfiles = profiles.filter((profile) => profile.username === MASTER_USERNAME);

  if (masterProfiles.length === 0) {
    throw new Error("O profile mestre não existe. Nenhuma limpeza foi realizada.");
  }

  if (masterProfiles.length > 1) {
    throw new Error("Há mais de um profile com username mestre. Nenhuma limpeza foi realizada.");
  }

  const [admin] = masterProfiles;
  if (admin.role !== "ADMIN") {
    throw new Error("O profile mestre não é ADMIN. Nenhuma limpeza foi realizada.");
  }

  if (admin.client_id !== null) {
    throw new Error("O profile ADMIN mestre possui client_id. Nenhuma limpeza foi realizada.");
  }

  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const adminAuthUser = authById.get(admin.id);
  if (!adminAuthUser) {
    throw new Error("O usuário Auth correspondente ao profile mestre não existe. Nenhuma limpeza foi realizada.");
  }

  const clientProfiles = profiles.filter((profile) => profile.role === "CLIENT");
  if (clientProfiles.some((profile) => profile.id === admin.id)) {
    throw new Error("O ADMIN mestre foi selecionado como CLIENT. Nenhuma limpeza foi realizada.");
  }

  return {
    admin,
    adminAuthUser,
    clientProfiles,
    clientAuthUsers: clientProfiles.flatMap((profile) => {
      const authUser = authById.get(profile.id);
      return authUser ? [{ profile, authUser }] : [];
    }),
    clientProfilesWithoutAuth: clientProfiles.filter((profile) => !authById.has(profile.id)),
  };
}

export function hasClientData(counts) {
  return CLIENT_DATA_COUNT_KEYS.some((key) => Number(counts[key] ?? 0) > 0);
}

export function isExactResetConfirmation(value) {
  return value === RESET_CONFIRMATION;
}

export async function executeResetWorkflow({
  dryRun,
  inspect,
  onPreview = () => {},
  confirm = async () => "",
  resetDatabase = async () => {
    throw new Error("resetDatabase não configurado.");
  },
  deleteAuthUsers = async () => {
    throw new Error("deleteAuthUsers não configurado.");
  },
  validateFinal = async () => {
    throw new Error("validateFinal não configurado.");
  },
}) {
  const preview = await inspect();
  onPreview(preview);

  const hasPendingAuth = preview.auth_users_to_delete.length > 0;
  if (!hasClientData(preview.counts_before) && !hasPendingAuth) {
    return { status: "empty", preview };
  }

  if (dryRun) {
    return { status: "dry-run", preview };
  }

  const confirmation = await confirm();
  if (!isExactResetConfirmation(confirmation)) {
    return { status: "cancelled", preview };
  }

  const resetResult = await resetDatabase(preview.admin.id);
  const authResult = await deleteAuthUsers(resetResult.auth_users_to_delete, preview.admin.id);
  const validation = await validateFinal({
    expectedAdminId: preview.admin.id,
    authCandidates: resetResult.auth_users_to_delete,
  });

  return { status: "completed", preview, resetResult, authResult, validation };
}
