import { assertUsername, findOrCreateAuthUser, findProfileByLoginUsername, formatSupabaseError, getOption, getRequiredEnvironment } from "./bootstrap-utils.mjs";

async function ensureAdminProfile(supabase, user, username) {
  const { data: profile, error: profileLookupError } = await supabase
    .from("profiles")
    .select("id, username, login_username, role, client_id, active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileLookupError) {
    throw new Error(`Não foi possível consultar o profile ADMIN. ${formatSupabaseError(profileLookupError)}`);
  }

  if (profile) {
    const isExpectedAdmin = profile.login_username === username
      && profile.role === "ADMIN"
      && profile.client_id === null
      && profile.active === true;

    if (!isExpectedAdmin) {
      throw new Error("Já existe um profile para este usuário Auth, mas ele não corresponde a um ADMIN ativo com este username. Nenhuma alteração foi feita.");
    }

    return false;
  }

  const { error: profileInsertError } = await supabase
    .from("profiles")
    .insert({ id: user.id, username, role: "ADMIN", client_id: null, active: true });

  if (profileInsertError) {
    throw new Error(`O usuário Auth existe, mas o profile ADMIN não foi criado. ${formatSupabaseError(profileInsertError)}`);
  }

  return true;
}

try {
  const usernameArgument = getOption("username");
  if (!usernameArgument) throw new Error("Uso: npm run create:admin -- --username nome-do-admin");
  const username = assertUsername(usernameArgument);
  const { supabase, password } = getRequiredEnvironment();
  const existingProfile = await findProfileByLoginUsername(supabase, username);

  if (existingProfile) {
    const { data, error } = await supabase.auth.admin.getUserById(existingProfile.id);
    if (error || !data.user) throw new Error("O profile ADMIN existente não possui identidade Auth correspondente. Nenhuma alteração foi feita.");
    const isExpectedAdmin = existingProfile.role === "ADMIN"
      && existingProfile.client_id === null
      && existingProfile.active === true;
    if (!isExpectedAdmin) throw new Error("Já existe um profile para este username de login, mas ele não corresponde a um ADMIN ativo. Nenhuma alteração foi feita.");
    console.log(`ADMIN já está configurado para o username: ${existingProfile.username}`);
  } else {
    const { user, created: authUserCreated } = await findOrCreateAuthUser(supabase, username, password);
    const profileCreated = await ensureAdminProfile(supabase, user, username);

    if (authUserCreated && profileCreated) {
      console.log(`ADMIN criado para o username: ${username}`);
    } else if (profileCreated) {
      console.log(`Profile ADMIN reparado para o username: ${username}`);
    } else {
      console.log(`ADMIN já está configurado para o username: ${username}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha ao criar ADMIN.");
  process.exitCode = 1;
}
