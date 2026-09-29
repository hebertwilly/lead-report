import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { formatSupabaseError } from "./bootstrap-utils.mjs";
import {
  buildIdentityPlan,
  CLIENT_DATA_COUNT_KEYS,
  executeResetWorkflow,
  hasClientData,
  RESET_CONFIRMATION,
} from "./reset-test-data-utils.mjs";

const args = process.argv.slice(2);
const unsupportedArgs = args.filter((arg) => arg !== "--dry-run");
if (unsupportedArgs.length > 0) {
  console.error(`Argumento não reconhecido: ${unsupportedArgs.join(", ")}`);
  console.error("Uso: node scripts/reset-test-data.mjs [--dry-run]");
  process.exitCode = 1;
} else {
  await main();
}

async function main() {
  try {
    loadLocalEnvironment();

    const dryRun = args.includes("--dry-run");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      throw new Error(
        "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY somente no ambiente server-side deste comando.",
      );
    }

    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("ATENÇÃO:");
    console.log("Este procedimento removerá TODOS os dados de CLIENTES e todos os usuários Auth CLIENT.");
    console.log("O ADMIN mestre será preservado.");
    console.log("");
    console.log(`Modo: ${dryRun ? "DRY-RUN (nenhum dado será apagado)" : "EXECUÇÃO REAL"}`);
    console.log(`Supabase URL: ${url}`);
    console.log("");

    const result = await executeResetWorkflow({
      dryRun,
      inspect: () => inspectCurrentState(supabase),
      onPreview: printPreview,
      confirm: () => requestConfirmation(),
      resetDatabase: (expectedAdminId) => resetDatabase(supabase, expectedAdminId),
      deleteAuthUsers: (candidates, expectedAdminId) => deleteQueuedAuthUsers(
        supabase,
        candidates,
        expectedAdminId,
      ),
      validateFinal: ({ expectedAdminId, authCandidates }) => validateFinalState(
        supabase,
        expectedAdminId,
        authCandidates,
      ),
    });

    if (result.status === "empty") {
      console.log("Nenhum dado de cliente para remover.");
      console.log("O profile e o usuário Auth do ADMIN mestre foram validados e permanecem íntegros.");
      return;
    }

    if (result.status === "dry-run") {
      console.log("");
      console.log("Dry-run concluído. Nenhum dado foi alterado.");
      console.log("Revise esta prévia antes de executar: npm run reset:test-data");
      return;
    }

    if (result.status === "cancelled") {
      console.log("Confirmação diferente do texto exigido. Operação cancelada; nenhum dado foi alterado.");
      return;
    }

    console.log("");
    console.log("Limpeza concluída e validada:");
    printCounts(result.resetResult.deleted_counts, "Registros removidos do banco");
    console.log(`Usuários Auth CLIENT removidos: ${result.authResult.deleted}`);
    console.log(`Usuários Auth CLIENT que já não existiam: ${result.authResult.alreadyMissing}`);
    console.log("clients: 0");
    console.log("profiles CLIENT: 0");
    console.log("profile mestre: existe e role = ADMIN");
    console.log("auth user mestre: existe");
    console.log("dados de cliente nas tabelas relacionadas: 0");
    console.log("fila de remoção Auth: 0");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Falha desconhecida durante a limpeza.");
    process.exitCode = 1;
  }
}

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;

  try {
    process.loadEnvFile(".env.local");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ENOENT")) throw error;
  }
}

async function listAllAuthUsers(supabase) {
  const users = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Não foi possível consultar os usuários Auth. ${formatSupabaseError(error)}`);
    }

    users.push(...data.users);
    if (data.users.length < perPage) return users;
  }
}

async function callResetProcedure(supabase, { dryRun, expectedAdminId }) {
  const { data, error } = await supabase.rpc("reset_test_client_data", {
    p_dry_run: dryRun,
    p_expected_admin_id: expectedAdminId,
  });

  if (error || !data) {
    throw new Error(`A operação transacional no banco falhou. ${formatSupabaseError(error)}`);
  }

  assertSnapshotShape(data);
  return data;
}

async function inspectCurrentState(supabase) {
  const [snapshot, authUsers] = await Promise.all([
    callResetProcedure(supabase, { dryRun: true, expectedAdminId: null }),
    listAllAuthUsers(supabase),
  ]);

  const profiles = [snapshot.admin, ...snapshot.client_profiles];
  buildIdentityPlan({ profiles, authUsers });

  const authById = new Map(authUsers.map((user) => [user.id, user]));
  return {
    ...snapshot,
    auth_users_found: snapshot.auth_users_to_delete.filter((candidate) => authById.has(candidate.id)),
    auth_users_already_missing: snapshot.auth_users_to_delete.filter((candidate) => !authById.has(candidate.id)),
  };
}

function assertSnapshotShape(snapshot) {
  const isObject = snapshot !== null && typeof snapshot === "object" && !Array.isArray(snapshot);
  if (!isObject
    || !snapshot.admin
    || !Array.isArray(snapshot.clients)
    || !Array.isArray(snapshot.client_profiles)
    || !Array.isArray(snapshot.auth_users_to_delete)
    || !snapshot.counts_before) {
    throw new Error("A função de limpeza retornou uma resposta inesperada. Nenhuma ação Auth foi executada.");
  }
}

function printPreview(snapshot) {
  console.log("ADMIN preservado:");
  console.log(`- username: ${snapshot.admin.username}`);
  console.log(`- id: ${snapshot.admin.id}`);
  console.log(`- role: ${snapshot.admin.role}`);
  console.log(`- active: ${snapshot.admin.active}`);
  console.log("- usuário Auth correspondente: encontrado");
  console.log("");
  console.log(`Quantidade de clients: ${snapshot.counts_before.clients}`);
  console.log(`Quantidade de profiles CLIENT: ${snapshot.counts_before.profiles_client}`);
  console.log(`Quantidade de usuários Auth CLIENT encontrados: ${snapshot.auth_users_found.length}`);
  console.log(`Usuários Auth CLIENT já ausentes: ${snapshot.auth_users_already_missing.length}`);

  console.log("");
  console.log("Clients que seriam removidos:");
  if (snapshot.clients.length === 0) console.log("- nenhum");
  for (const client of snapshot.clients) {
    console.log(`- ${client.name} (${client.slug}; id ${client.id})`);
  }

  console.log("");
  console.log("Usernames CLIENT que seriam removidos:");
  if (snapshot.client_profiles.length === 0) console.log("- nenhum");
  for (const profile of snapshot.client_profiles) {
    console.log(`- ${profile.username} (profile/Auth id ${profile.id})`);
  }

  console.log("");
  console.log("Usuários Auth que seriam removidos:");
  if (snapshot.auth_users_to_delete.length === 0) console.log("- nenhum");
  const foundIds = new Set(snapshot.auth_users_found.map((candidate) => candidate.id));
  for (const candidate of snapshot.auth_users_to_delete) {
    const status = foundIds.has(candidate.id) ? "encontrado" : "já ausente";
    console.log(`- ${candidate.username} (id ${candidate.id}; ${status})`);
  }

  printCounts(snapshot.counts_before, "Quantidade de registros por tabela");
}

function printCounts(counts, title) {
  console.log("");
  console.log(`${title}:`);
  for (const key of CLIENT_DATA_COUNT_KEYS) {
    console.log(`- ${key}: ${counts[key] ?? 0}`);
  }
}

async function requestConfirmation() {
  console.log("");
  console.log("Para continuar, digite exatamente:");
  console.log(RESET_CONFIRMATION);

  const readline = createInterface({ input, output });
  try {
    return await readline.question("> ");
  } finally {
    readline.close();
  }
}

async function resetDatabase(supabase, expectedAdminId) {
  const result = await callResetProcedure(supabase, {
    dryRun: false,
    expectedAdminId,
  });

  if (result.admin.id !== expectedAdminId) {
    throw new Error("A função retornou outro ADMIN mestre após a limpeza. Interrompendo antes do Auth.");
  }

  if (hasClientData(result.counts_after ?? {})) {
    throw new Error("A transação terminou, mas ainda há dados CLIENT no banco. Usuários Auth não foram removidos.");
  }

  if (result.auth_users_to_delete.some((candidate) => candidate.id === expectedAdminId)) {
    throw new Error("O ADMIN mestre apareceu entre os candidatos Auth. Nenhum usuário Auth foi removido.");
  }

  return result;
}

async function deleteQueuedAuthUsers(supabase, candidates, expectedAdminId) {
  const authUsers = await listAllAuthUsers(supabase);
  const existingIds = new Set(authUsers.map((user) => user.id));
  let deleted = 0;
  let alreadyMissing = 0;
  const failures = [];

  for (const candidate of candidates) {
    if (candidate.id === expectedAdminId) {
      throw new Error("Proteção acionada: tentativa de remover o usuário Auth do ADMIN mestre.");
    }

    if (existingIds.has(candidate.id)) {
      const { error } = await supabase.auth.admin.deleteUser(candidate.id);
      if (error) {
        failures.push(`${candidate.username}: ${formatSupabaseError(error)}`);
        continue;
      }
      deleted += 1;
    } else {
      alreadyMissing += 1;
    }

    const { error: acknowledgeError } = await supabase.rpc(
      "acknowledge_reset_test_data_auth_deletion",
      {
        p_auth_user_id: candidate.id,
        p_expected_admin_id: expectedAdminId,
      },
    );

    if (acknowledgeError) {
      failures.push(`${candidate.username} (confirmação da fila): ${formatSupabaseError(acknowledgeError)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `A limpeza do banco foi concluída, mas houve falha na etapa Auth. `
      + `A fila técnica preserva os IDs pendentes para nova tentativa. Falhas: ${failures.join(" | ")}`,
    );
  }

  return { deleted, alreadyMissing };
}

async function validateFinalState(supabase, expectedAdminId, authCandidates) {
  const [snapshot, authUsers] = await Promise.all([
    callResetProcedure(supabase, { dryRun: true, expectedAdminId }),
    listAllAuthUsers(supabase),
  ]);

  const identity = buildIdentityPlan({ profiles: [snapshot.admin], authUsers });
  if (identity.admin.id !== expectedAdminId) {
    throw new Error("Validação final falhou: o ADMIN mestre não é o mesmo validado na prévia.");
  }

  if (hasClientData(snapshot.counts_before)) {
    throw new Error("Validação final falhou: ainda existem dados em tabelas de cliente.");
  }

  if (snapshot.auth_users_to_delete.length > 0 || Number(snapshot.pending_auth_deletions) > 0) {
    throw new Error("Validação final falhou: ainda existem remoções Auth pendentes na fila técnica.");
  }

  const remainingAuthIds = new Set(authUsers.map((user) => user.id));
  const remainingCandidates = authCandidates.filter((candidate) => remainingAuthIds.has(candidate.id));
  if (remainingCandidates.length > 0) {
    throw new Error(
      `Validação final falhou: usuários Auth CLIENT ainda existem: ${remainingCandidates.map((item) => item.username).join(", ")}.`,
    );
  }

  return { snapshot };
}
