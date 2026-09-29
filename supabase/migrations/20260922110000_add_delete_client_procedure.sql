begin;

-- A fila não referencia clients nem auth.users: ambos podem já ter sido removidos
-- quando uma nova tentativa precisar concluir a exclusão no Supabase Auth.
create table public.client_deletion_auth_queue (
  client_id uuid primary key,
  auth_user_id uuid not null unique,
  username text not null,
  queued_at timestamptz not null default now()
);

alter table public.client_deletion_auth_queue enable row level security;
revoke all on public.client_deletion_auth_queue from public, anon, authenticated;
grant select, insert, update, delete on public.client_deletion_auth_queue to service_role;

create function public.delete_client_permanently(
  p_client_id uuid,
  p_expected_profile_id uuid,
  p_expected_username text
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
  v_profile_count bigint;
  v_profile_id uuid;
  v_profile_username text;
  v_profile_role public.user_role;
  v_profile_client_id uuid;
  v_daily_report_ids uuid[] := array[]::uuid[];
  v_report_source_ids uuid[] := array[]::uuid[];
  v_lead_source_ids uuid[] := array[]::uuid[];
  v_affected bigint;
  v_deleted_counts jsonb := '{}'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'A exclusão permanente exige a service_role.' using errcode = '42501';
  end if;
  if p_client_id is null or p_expected_profile_id is null or p_expected_username is null then
    raise exception 'Identificação incompleta para exclusão do cliente.' using errcode = '22023';
  end if;

  -- Falha antes de mutar se uma FK nova ligada a clients ainda não foi revisada.
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
  ) into v_reachable_tables
  from client_owned_tables
  join pg_catalog.pg_class as table_info on table_info.oid = client_owned_tables.table_oid;

  if v_reachable_tables is distinct from v_expected_tables then
    raise exception 'Schema de dados de cliente divergente. Esperado: %. Encontrado: %. Atualize o procedimento antes de excluir.',
      v_expected_tables, v_reachable_tables using errcode = '55000';
  end if;

  lock table
    public.clients, public.profiles, public.daily_reports, public.report_sources,
    public.objections, public.shipping_cities, public.lead_sources,
    public.lead_source_active_periods, public.client_goals,
    public.client_deletion_auth_queue
  in access exclusive mode;

  select count(*) into v_master_count from public.profiles where username = 'mestre';
  if v_master_count <> 1 then
    raise exception 'O profile mestre não é único ou não existe. Nenhuma exclusão foi realizada.' using errcode = 'P0001';
  end if;
  select id, role, client_id into v_master_id, v_master_role, v_master_client_id
  from public.profiles where username = 'mestre';
  if v_master_role <> 'ADMIN'::public.user_role or v_master_client_id is not null
    or not exists (select 1 from auth.users where id = v_master_id) then
    raise exception 'A identidade do ADMIN mestre está inconsistente. Nenhuma exclusão foi realizada.' using errcode = 'P0001';
  end if;
  if p_expected_profile_id = v_master_id or p_expected_username = 'mestre' then
    raise exception 'O ADMIN mestre nunca pode ser excluído.' using errcode = '42501';
  end if;

  -- Repetição após o commit do banco: a única ação permitida é devolver a
  -- pendência previamente registrada, nunca selecionar outra identidade Auth.
  if not exists (select 1 from public.clients where id = p_client_id) then
    if exists (
      select 1 from public.client_deletion_auth_queue
      where client_id = p_client_id
        and auth_user_id = p_expected_profile_id
        and username = p_expected_username
        and auth_user_id <> v_master_id
        and username <> 'mestre'
    ) then
      return jsonb_build_object('status', 'auth_pending', 'auth_user_id', p_expected_profile_id, 'username', p_expected_username);
    end if;
    raise exception 'Cliente não encontrado ou confirmação não corresponde a uma exclusão pendente.' using errcode = 'P0002';
  end if;

  select count(*) into v_profile_count from public.profiles where client_id = p_client_id;
  if v_profile_count <> 1 then
    raise exception 'O cliente possui % profiles associados; a exclusão foi interrompida para revisão.', v_profile_count using errcode = 'P0001';
  end if;
  select id, username, role, client_id into v_profile_id, v_profile_username, v_profile_role, v_profile_client_id
  from public.profiles where client_id = p_client_id;
  if v_profile_id <> p_expected_profile_id or v_profile_username <> p_expected_username then
    raise exception 'A confirmação não corresponde ao acesso atual do cliente.' using errcode = '22023';
  end if;
  if v_profile_role <> 'CLIENT'::public.user_role or v_profile_client_id <> p_client_id
    or v_profile_id = v_master_id or v_profile_username = 'mestre' then
    raise exception 'A relação do cliente aponta para um profile protegido ou não CLIENT. Nenhuma exclusão foi realizada.' using errcode = '42501';
  end if;

  select coalesce(array_agg(id order by id), array[]::uuid[]) into v_daily_report_ids
  from public.daily_reports where client_id = p_client_id;
  select coalesce(array_agg(id order by id), array[]::uuid[]) into v_report_source_ids
  from public.report_sources where daily_report_id = any(v_daily_report_ids);
  select coalesce(array_agg(id order by id), array[]::uuid[]) into v_lead_source_ids
  from public.lead_sources where client_id = p_client_id;

  insert into public.client_deletion_auth_queue (client_id, auth_user_id, username)
  values (p_client_id, v_profile_id, v_profile_username)
  on conflict (client_id) do update set auth_user_id = excluded.auth_user_id, username = excluded.username;

  delete from public.objections where report_source_id = any(v_report_source_ids);
  get diagnostics v_affected = row_count; v_deleted_counts := v_deleted_counts || jsonb_build_object('objections', v_affected);
  delete from public.shipping_cities where report_source_id = any(v_report_source_ids);
  get diagnostics v_affected = row_count; v_deleted_counts := v_deleted_counts || jsonb_build_object('shipping_cities', v_affected);
  delete from public.report_sources where id = any(v_report_source_ids);
  get diagnostics v_affected = row_count; v_deleted_counts := v_deleted_counts || jsonb_build_object('report_sources', v_affected);
  delete from public.daily_reports where id = any(v_daily_report_ids);
  get diagnostics v_affected = row_count; v_deleted_counts := v_deleted_counts || jsonb_build_object('daily_reports', v_affected);
  delete from public.lead_source_active_periods where lead_source_id = any(v_lead_source_ids);
  get diagnostics v_affected = row_count; v_deleted_counts := v_deleted_counts || jsonb_build_object('lead_source_active_periods', v_affected);
  delete from public.lead_sources where id = any(v_lead_source_ids);
  get diagnostics v_affected = row_count; v_deleted_counts := v_deleted_counts || jsonb_build_object('lead_sources', v_affected);
  delete from public.client_goals where client_id = p_client_id;
  get diagnostics v_affected = row_count; v_deleted_counts := v_deleted_counts || jsonb_build_object('client_goals', v_affected);
  delete from public.profiles where id = v_profile_id and role = 'CLIENT'::public.user_role and client_id = p_client_id and id <> v_master_id;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'O profile CLIENT não foi removido com segurança.' using errcode = 'P0001'; end if;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles_client', v_affected);
  delete from public.clients where id = p_client_id;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'O cliente não foi removido com segurança.' using errcode = 'P0001'; end if;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('clients', v_affected);

  return jsonb_build_object('status', 'database_deleted', 'auth_user_id', v_profile_id, 'username', v_profile_username, 'deleted_counts', v_deleted_counts);
end;
$$;

create function public.acknowledge_client_deletion_auth(
  p_client_id uuid,
  p_auth_user_id uuid,
  p_expected_username text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_master_id uuid; v_affected bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'A confirmação exige a service_role.' using errcode = '42501'; end if;
  select id into v_master_id from public.profiles where username = 'mestre' and role = 'ADMIN'::public.user_role and client_id is null;
  if v_master_id is null or p_auth_user_id = v_master_id or p_expected_username = 'mestre' then raise exception 'O ADMIN mestre não pode ser confirmado nesta fila.' using errcode = '42501'; end if;
  delete from public.client_deletion_auth_queue
  where client_id = p_client_id and auth_user_id = p_auth_user_id and username = p_expected_username;
  get diagnostics v_affected = row_count;
  return v_affected > 0;
end;
$$;

revoke all on function public.delete_client_permanently(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.acknowledge_client_deletion_auth(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_client_permanently(uuid, uuid, text) to service_role;
grant execute on function public.acknowledge_client_deletion_auth(uuid, uuid, text) to service_role;

commit;
