import { assertUsername, createAuthUser, getOption, getRequiredEnvironment } from "./bootstrap-utils.mjs";

const defaultSources = [
  { name: "Tráfego Pago", key: "trafego-pago", active: true, primary: true, sortOrder: 0 },
  { name: "Orgânico", key: "organico", active: true, primary: false, sortOrder: 1 },
  { name: "Instagram / Links", key: "instagram-links", active: true, primary: false, sortOrder: 2 },
];

try {
  const name = getOption("client-name")?.trim();
  const usernameArgument = getOption("username");
  if (!name || !usernameArgument) throw new Error("Uso: npm run create:test-client -- --client-name \"Cliente Teste\" --username cliente-teste");

  const username = assertUsername(usernameArgument);
  const { supabase, password } = getRequiredEnvironment();
  const user = await createAuthUser(supabase, username, password);
  const { data: clientId, error } = await supabase.rpc("provision_client_with_access", {
    p_auth_user_id: user.id,
    p_name: name,
    p_username: username,
    p_active: true,
    p_sources: defaultSources,
  });

  if (error || !clientId) {
    const rollback = await supabase.auth.admin.deleteUser(user.id);
    if (rollback.error) throw new Error("O provisionamento falhou e a identidade Auth não pôde ser revertida; revise-a antes de tentar novamente.");
    throw new Error("Não foi possível provisionar o CLIENT de teste; a identidade Auth recém-criada foi revertida.");
  }
  console.log(`CLIENT de teste criado para o username: ${username}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha ao criar CLIENT de teste.");
  process.exitCode = 1;
}
