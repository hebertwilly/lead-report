import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildIdentityPlan,
  executeResetWorkflow,
  isExactResetConfirmation,
} from "../scripts/reset-test-data-utils.mjs";

const masterProfile = {
  id: "admin-id",
  username: "mestre",
  role: "ADMIN",
  client_id: null,
  active: true,
};

const clientProfile = {
  id: "client-id",
  username: "cliente-teste",
  role: "CLIENT",
  client_id: "company-id",
  active: true,
};

const emptyCounts = {
  objections: 0,
  shipping_cities: 0,
  report_sources: 0,
  daily_reports: 0,
  lead_source_active_periods: 0,
  lead_sources: 0,
  client_goals: 0,
  profiles_client: 0,
  clients: 0,
};

function makePreview(overrides = {}) {
  return {
    admin: masterProfile,
    clients: [],
    client_profiles: [],
    auth_users_to_delete: [],
    counts_before: emptyCounts,
    ...overrides,
  };
}

test("preserva o mestre e nunca o inclui entre usuários CLIENT", () => {
  const plan = buildIdentityPlan({
    profiles: [masterProfile, clientProfile],
    authUsers: [{ id: "admin-id" }, { id: "client-id" }],
  });

  assert.equal(plan.admin.id, "admin-id");
  assert.deepEqual(plan.clientProfiles.map((profile) => profile.id), ["client-id"]);
  assert.deepEqual(plan.clientAuthUsers.map((item) => item.authUser.id), ["client-id"]);
});

test("seleciona apenas usuários Auth correspondentes a profiles CLIENT", () => {
  const otherAdmin = { ...masterProfile, id: "admin-2", username: "admin-secundario" };
  const plan = buildIdentityPlan({
    profiles: [masterProfile, otherAdmin, clientProfile],
    authUsers: [{ id: "admin-id" }, { id: "admin-2" }, { id: "client-id" }, { id: "orphan-id" }],
  });

  assert.deepEqual(plan.clientAuthUsers.map((item) => item.authUser.id), ["client-id"]);
});

test("bloqueia quando mestre não existe", () => {
  assert.throws(
    () => buildIdentityPlan({ profiles: [clientProfile], authUsers: [{ id: "client-id" }] }),
    /profile mestre não existe/,
  );
});

test("bloqueia quando há mais de um profile mestre", () => {
  assert.throws(
    () => buildIdentityPlan({
      profiles: [masterProfile, { ...masterProfile, id: "admin-duplicado" }],
      authUsers: [{ id: "admin-id" }, { id: "admin-duplicado" }],
    }),
    /mais de um profile com username mestre/,
  );
});

test("bloqueia quando mestre não é ADMIN", () => {
  assert.throws(
    () => buildIdentityPlan({
      profiles: [{ ...masterProfile, role: "CLIENT", client_id: "company-id" }],
      authUsers: [{ id: "admin-id" }],
    }),
    /profile mestre não é ADMIN/,
  );
});

test("bloqueia quando o Auth correspondente ao mestre não existe", () => {
  assert.throws(
    () => buildIdentityPlan({ profiles: [masterProfile], authUsers: [] }),
    /usuário Auth correspondente.*não existe/,
  );
});

test("aceita somente a confirmação literal completa", () => {
  assert.equal(isExactResetConfirmation("RESET CLIENT DATA"), true);
  assert.equal(isExactResetConfirmation("y"), false);
  assert.equal(isExactResetConfirmation("yes"), false);
  assert.equal(isExactResetConfirmation("sim"), false);
  assert.equal(isExactResetConfirmation("RESET CLIENT DATA "), false);
});

test("sem clients retorna vazio e não chama mutações", async () => {
  let mutations = 0;
  const result = await executeResetWorkflow({
    dryRun: false,
    inspect: async () => makePreview(),
    confirm: async () => {
      mutations += 1;
      return "RESET CLIENT DATA";
    },
    resetDatabase: async () => {
      mutations += 1;
    },
    deleteAuthUsers: async () => {
      mutations += 1;
    },
    validateFinal: async () => {
      mutations += 1;
    },
  });

  assert.equal(result.status, "empty");
  assert.equal(mutations, 0);
});

test("dry-run não chama confirmação nem qualquer mutação", async () => {
  let mutations = 0;
  const result = await executeResetWorkflow({
    dryRun: true,
    inspect: async () => makePreview({
      clients: [{ id: "company-id", name: "Teste", slug: "teste" }],
      client_profiles: [clientProfile],
      auth_users_to_delete: [{ id: "client-id", username: "cliente-teste" }],
      counts_before: { ...emptyCounts, clients: 1, profiles_client: 1 },
    }),
    confirm: async () => {
      mutations += 1;
      return "RESET CLIENT DATA";
    },
    resetDatabase: async () => {
      mutations += 1;
    },
    deleteAuthUsers: async () => {
      mutations += 1;
    },
    validateFinal: async () => {
      mutations += 1;
    },
  });

  assert.equal(result.status, "dry-run");
  assert.equal(mutations, 0);
});

test("uma segunda execução após a limpeza é idempotente", async () => {
  let hasData = true;
  let resets = 0;
  const inspect = async () => hasData
    ? makePreview({
      clients: [{ id: "company-id", name: "Teste", slug: "teste" }],
      client_profiles: [clientProfile],
      auth_users_to_delete: [{ id: "client-id", username: "cliente-teste" }],
      counts_before: { ...emptyCounts, clients: 1, profiles_client: 1 },
    })
    : makePreview();

  const run = () => executeResetWorkflow({
    dryRun: false,
    inspect,
    confirm: async () => "RESET CLIENT DATA",
    resetDatabase: async () => {
      resets += 1;
      hasData = false;
      return makePreview({ auth_users_to_delete: [] });
    },
    deleteAuthUsers: async () => ({}),
    validateFinal: async () => ({}),
  });

  assert.equal((await run()).status, "completed");
  assert.equal((await run()).status, "empty");
  assert.equal(resets, 1);
});

test("a migration corretiva limita todo DELETE ao escopo capturado", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260914163000_fix_reset_test_data_deletes.sql", import.meta.url),
    "utf8",
  );
  const functionBody = migration.match(
    /create or replace function public\.reset_test_client_data[\s\S]*?\$\$;/m,
  )?.[0];

  assert.ok(functionBody, "a função corretiva deve existir na migration nova");
  const deletes = functionBody.match(/delete from public\.[\s\S]*?;/gi) ?? [];
  assert.equal(deletes.length, 9);
  for (const statement of deletes) {
    assert.match(statement, /\bwhere\b/i, `DELETE sem WHERE: ${statement}`);
  }

  assert.match(functionBody, /delete from public\.objections\s+where report_source_id = any\(v_report_source_ids\)/i);
  assert.match(functionBody, /delete from public\.shipping_cities\s+where report_source_id = any\(v_report_source_ids\)/i);
  assert.match(functionBody, /delete from public\.report_sources\s+where id = any\(v_report_source_ids\)/i);
  assert.match(functionBody, /delete from public\.daily_reports\s+where id = any\(v_daily_report_ids\)/i);
  assert.match(functionBody, /delete from public\.lead_source_active_periods\s+where lead_source_id = any\(v_lead_source_ids\)/i);
  assert.match(functionBody, /delete from public\.lead_sources\s+where id = any\(v_lead_source_ids\)/i);
  assert.match(functionBody, /delete from public\.client_goals\s+where client_id = any\(v_client_ids\)/i);
  assert.match(functionBody, /delete from public\.profiles\s+where id = any\(v_client_profile_ids\)\s+and id <> v_master_id/i);
  assert.match(functionBody, /delete from public\.clients\s+where id = any\(v_client_ids\)/i);
});

test("a migration corretiva captura CLIENTs, exclui o mestre e mantém DELETEs fora do dry-run", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260914163000_fix_reset_test_data_deletes.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /where profile\.role = 'CLIENT'::public\.user_role\s+and profile\.client_id = any\(v_client_ids\)\s+and profile\.id <> v_master_id/i);
  assert.match(migration, /p_expected_admin_id is null or p_expected_admin_id <> v_master_id/i);
  assert.match(migration, /if not p_dry_run then[\s\S]*?delete from public\.objections[\s\S]*?delete from public\.clients[\s\S]*?end if;/i);
  assert.match(migration, /array\[\]::uuid\[\]/i);
});
