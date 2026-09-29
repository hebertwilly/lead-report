begin;

-- A migration anterior já está aplicada. Esta substitui a função no banco
-- remoto sem alterar o histórico e mantém cada DELETE limitado ao escopo
-- capturado no início da execução.
create or replace function public.reset_test_client_data(
  p_dry_run boolean default true,
  p_expected_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_tables constant text[] := array[
    'client_goals', 'daily_reports', 'lead_source_active_periods',
    'lead_sources', 'objections', 'profiles', 'report_sources', 'shipping_cities'
  ];
  v_reachable_tables text[];
  v_master_count bigint;
  v_master_id uuid;
  v_master_role public.user_role;
  v_master_client_id uuid;
  v_master_active boolean;
  v_client_ids uuid[] := array[]::uuid[];
  v_client_profile_ids uuid[] := array[]::uuid[];
  v_daily_report_ids uuid[] := array[]::uuid[];
  v_report_source_ids uuid[] := array[]::uuid[];
  v_lead_source_ids uuid[] := array[]::uuid[];
  v_clients jsonb;
  v_client_profiles jsonb;
  v_auth_candidates jsonb;
  v_counts_before jsonb;
  v_counts_after jsonb;
  v_deleted_counts jsonb := '{}'::jsonb;
  v_affected bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'A limpeza exige a service_role.' using errcode = '42501';
  end if;

  if p_dry_run is null then
    raise exception 'Informe explicitamente se a operação é dry-run.' using errcode = '22023';
  end if;

  with recursive client_owned_tables(table_oid) as (
    select 'public.clients'::regclass::oid
    union
    select constraint_row.conrelid
    from pg_catalog.pg_constraint as constraint_row
    join client_owned_tables as parent on parent.table_oid = constraint_row.confrelid
    join pg_catalog.pg_class as child_table on child_table.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as child_schema on child_schema.oid = child_table.relnamespace
    where constraint_row.contype = 'f' and child_schema.nspname = 'public'
  )
  select coalesce(
    array_agg(table_info.relname::text order by table_info.relname::text)
      filter (where table_info.oid <> 'public.clients'::regclass::oid),
    array[]::text[]
  )
  into v_reachable_tables
  from client_owned_tables
  join pg_catalog.pg_class as table_info on table_info.oid = client_owned_tables.table_oid;

  if v_reachable_tables is distinct from v_expected_tables then
    raise exception 'Schema de dados de cliente divergente. Esperado: %. Encontrado: %. Atualize o procedimento antes de limpar.',
      v_expected_tables, v_reachable_tables using errcode = '55000';
  end if;

  if not p_dry_run then
    lock table
      public.clients, public.profiles, public.daily_reports, public.report_sources,
      public.objections, public.shipping_cities, public.lead_sources,
      public.lead_source_active_periods, public.client_goals,
      public.reset_test_data_auth_queue
    in access exclusive mode;
  end if;

  select count(*) into v_master_count
  from public.profiles
  where username = 'mestre';

  if v_master_count = 0 then
    raise exception 'O profile mestre não existe. Nenhuma limpeza foi realizada.' using errcode = 'P0001';
  end if;
  if v_master_count > 1 then
    raise exception 'Há mais de um profile com username mestre. Nenhuma limpeza foi realizada.' using errcode = 'P0001';
  end if;

  select id, role, client_id, active
  into v_master_id, v_master_role, v_master_client_id, v_master_active
  from public.profiles
  where username = 'mestre';

  if v_master_role <> 'ADMIN'::public.user_role then
    raise exception 'O profile mestre não é ADMIN. Nenhuma limpeza foi realizada.' using errcode = 'P0001';
  end if;
  if v_master_client_id is not null then
    raise exception 'O profile ADMIN mestre possui client_id. Nenhuma limpeza foi realizada.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = v_master_id) then
    raise exception 'O usuário Auth correspondente ao profile mestre não existe. Nenhuma limpeza foi realizada.' using errcode = 'P0001';
  end if;
  if not p_dry_run and (p_expected_admin_id is null or p_expected_admin_id <> v_master_id) then
    raise exception 'A identidade do ADMIN mestre mudou desde a prévia. Nenhuma limpeza foi realizada.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.reset_test_data_auth_queue where auth_user_id = v_master_id
  ) then
    raise exception 'O ADMIN mestre apareceu na fila de remoção Auth. Nenhuma limpeza foi realizada.' using errcode = 'P0001';
  end if;

  -- Captura o escopo antes de qualquer mutação. Arrays vazios são seguros:
  -- `id = any('{}')` não seleciona linhas, preservando a idempotência.
  select coalesce(array_agg(client.id order by client.id), array[]::uuid[])
  into v_client_ids
  from public.clients as client;

  select coalesce(array_agg(profile.id order by profile.id), array[]::uuid[])
  into v_client_profile_ids
  from public.profiles as profile
  where profile.role = 'CLIENT'::public.user_role
    and profile.client_id = any(v_client_ids)
    and profile.id <> v_master_id;

  select coalesce(array_agg(report.id order by report.id), array[]::uuid[])
  into v_daily_report_ids
  from public.daily_reports as report
  where report.client_id = any(v_client_ids);

  select coalesce(array_agg(source.id order by source.id), array[]::uuid[])
  into v_report_source_ids
  from public.report_sources as source
  where source.daily_report_id = any(v_daily_report_ids);

  select coalesce(array_agg(source.id order by source.id), array[]::uuid[])
  into v_lead_source_ids
  from public.lead_sources as source
  where source.client_id = any(v_client_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', client.id, 'name', client.name, 'slug', client.slug, 'active', client.active
  ) order by client.name, client.id), '[]'::jsonb)
  into v_clients
  from public.clients as client
  where client.id = any(v_client_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', profile.id, 'client_id', profile.client_id, 'username', profile.username,
    'role', profile.role, 'active', profile.active
  ) order by profile.username, profile.id), '[]'::jsonb)
  into v_client_profiles
  from public.profiles as profile
  where profile.id = any(v_client_profile_ids)
    and profile.id <> v_master_id;

  select jsonb_build_object(
    'clients', (select count(*) from public.clients where id = any(v_client_ids)),
    'profiles_client', (select count(*) from public.profiles where id = any(v_client_profile_ids) and id <> v_master_id),
    'lead_sources', (select count(*) from public.lead_sources where id = any(v_lead_source_ids)),
    'lead_source_active_periods', (select count(*) from public.lead_source_active_periods where lead_source_id = any(v_lead_source_ids)),
    'daily_reports', (select count(*) from public.daily_reports where id = any(v_daily_report_ids)),
    'report_sources', (select count(*) from public.report_sources where id = any(v_report_source_ids)),
    'objections', (select count(*) from public.objections where report_source_id = any(v_report_source_ids)),
    'shipping_cities', (select count(*) from public.shipping_cities where report_source_id = any(v_report_source_ids)),
    'client_goals', (select count(*) from public.client_goals where client_id = any(v_client_ids))
  ) into v_counts_before;

  if not p_dry_run then
    insert into public.reset_test_data_auth_queue (auth_user_id, username)
    select profile.id, profile.username
    from public.profiles as profile
    where profile.id = any(v_client_profile_ids)
      and profile.id <> v_master_id
    on conflict (auth_user_id) do update set username = excluded.username;

    delete from public.objections
    where report_source_id = any(v_report_source_ids);
    get diagnostics v_affected = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('objections', v_affected);

    delete from public.shipping_cities
    where report_source_id = any(v_report_source_ids);
    get diagnostics v_affected = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('shipping_cities', v_affected);

    delete from public.report_sources
    where id = any(v_report_source_ids);
    get diagnostics v_affected = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('report_sources', v_affected);

    delete from public.daily_reports
    where id = any(v_daily_report_ids);
    get diagnostics v_affected = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('daily_reports', v_affected);

    delete from public.lead_source_active_periods
    where lead_source_id = any(v_lead_source_ids);
    get diagnostics v_affected = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('lead_source_active_periods', v_affected);

    delete from public.lead_sources
    where id = any(v_lead_source_ids);
    get diagnostics v_affected = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('lead_sources', v_affected);

    delete from public.client_goals
    where client_id = any(v_client_ids);
    get diagnostics v_affected = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('client_goals', v_affected);

    delete from public.profiles
    where id = any(v_client_profile_ids)
      and id <> v_master_id;
    get diagnostics v_affected = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles_client', v_affected);

    delete from public.clients
    where id = any(v_client_ids);
    get diagnostics v_affected = row_count;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('clients', v_affected);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', candidate.auth_user_id, 'username', candidate.username
  ) order by candidate.username, candidate.auth_user_id), '[]'::jsonb)
  into v_auth_candidates
  from (
    select profile.id as auth_user_id, profile.username
    from public.profiles as profile
    where profile.id = any(v_client_profile_ids)
      and profile.id <> v_master_id
    union
    select queued.auth_user_id, queued.username
    from public.reset_test_data_auth_queue as queued
    where queued.auth_user_id <> v_master_id
  ) as candidate;

  if not p_dry_run then
    select jsonb_build_object(
      'clients', (select count(*) from public.clients where id = any(v_client_ids)),
      'profiles_client', (select count(*) from public.profiles where id = any(v_client_profile_ids) and id <> v_master_id),
      'lead_sources', (select count(*) from public.lead_sources where id = any(v_lead_source_ids)),
      'lead_source_active_periods', (select count(*) from public.lead_source_active_periods where lead_source_id = any(v_lead_source_ids)),
      'daily_reports', (select count(*) from public.daily_reports where id = any(v_daily_report_ids)),
      'report_sources', (select count(*) from public.report_sources where id = any(v_report_source_ids)),
      'objections', (select count(*) from public.objections where report_source_id = any(v_report_source_ids)),
      'shipping_cities', (select count(*) from public.shipping_cities where report_source_id = any(v_report_source_ids)),
      'client_goals', (select count(*) from public.client_goals where client_id = any(v_client_ids))
    ) into v_counts_after;
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'admin', jsonb_build_object('id', v_master_id, 'username', 'mestre', 'role', v_master_role, 'client_id', v_master_client_id, 'active', v_master_active),
    'clients', v_clients,
    'client_profiles', v_client_profiles,
    'auth_users_to_delete', v_auth_candidates,
    'counts_before', v_counts_before,
    'deleted_counts', v_deleted_counts,
    'counts_after', v_counts_after,
    'pending_auth_deletions', (select count(*) from public.reset_test_data_auth_queue where auth_user_id <> v_master_id)
  );
end;
$$;

revoke all on function public.reset_test_client_data(boolean, uuid) from public, anon, authenticated;
grant execute on function public.reset_test_client_data(boolean, uuid) to service_role;

comment on function public.reset_test_client_data(boolean, uuid) is
  'Pré-visualiza ou remove transacionalmente dados CLIENT no escopo de IDs capturados, preservando profiles ADMIN e enfileirando a remoção Auth.';

commit;
