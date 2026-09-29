import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/20260922110000_add_delete_client_procedure.sql", import.meta.url);
const actionUrl = new URL("../src/app/(protected)/admin/actions.ts", import.meta.url);

test("a procedure de exclusão mantém cada DELETE limitado ao cliente ou aos IDs do alvo", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const body = migration.match(/create function public\.delete_client_permanently[\s\S]*?\$\$;/m)?.[0];
  assert.ok(body);
  const deletes = body.match(/delete from public\.[\s\S]*?;/gi) ?? [];
  assert.equal(deletes.length, 9);
  for (const statement of deletes) assert.match(statement, /\bwhere\b/i, `DELETE sem WHERE: ${statement}`);
  assert.match(body, /delete from public\.objections where report_source_id = any\(v_report_source_ids\)/i);
  assert.match(body, /delete from public\.clients where id = p_client_id/i);
  assert.match(body, /v_reachable_tables is distinct from v_expected_tables/i);
});

test("a procedure protege ADMIN, mestre e exige exatamente um profile do alvo", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /v_master_count <> 1/i);
  assert.match(migration, /p_expected_profile_id = v_master_id or p_expected_username = 'mestre'/i);
  assert.match(migration, /v_profile_count <> 1/i);
  assert.match(migration, /v_profile_role <> 'CLIENT'::public\.user_role/i);
  assert.match(migration, /v_profile_id = v_master_id or v_profile_username = 'mestre'/i);
});

test("a fila torna a fronteira Auth recuperável e não seleciona outro UUID no retry", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create table public\.client_deletion_auth_queue/i);
  assert.match(migration, /auth_user_id = p_expected_profile_id/i);
  assert.match(migration, /username = p_expected_username/i);
  assert.match(migration, /acknowledge_client_deletion_auth/i);
});

test("a Server Action exige ADMIN, reconfirma username e remove apenas o Auth do profile selecionado", async () => {
  const action = await readFile(actionUrl, "utf8");
  const body = action.match(/export async function deleteManagedClient[\s\S]*?\n}\n\nasync function finishClientAuthDeletion/m)?.[0];
  assert.ok(body);
  assert.match(body, /await requireAdmin\(\)/);
  assert.match(body, /profile\.role !== "CLIENT"/);
  assert.match(body, /profile\.username === "mestre"/);
  assert.match(body, /confirmation !== profile\.username/);
  assert.match(body, /p_expected_profile_id: profile\.id/);
  const authStep = action.match(/async function finishClientAuthDeletion[\s\S]*?\n}\n\nexport async function updateClientGoal/m)?.[0];
  assert.ok(authStep);
  assert.match(authStep, /deleteUser\(pending\.auth_user_id\)/);
});

test("a UI exige a confirmação literal e bloqueia envios concorrentes", async () => {
  const component = await readFile(new URL("../src/components/admin/delete-client-section.tsx", import.meta.url), "utf8");
  assert.match(component, /confirmation === username/);
  assert.match(component, /disabled=\{!canConfirm \|\| pending\}/);
  assert.match(component, /Excluindo\.\.\./);
});
