begin;

-- A criação pelo ADMIN é a fonte de verdade das origens de novos clientes.
-- As origens já existentes permanecem intactas.
drop trigger if exists clients_create_default_lead_sources on public.clients;
drop function if exists public.create_default_lead_sources_for_client();

create function public.provision_client_with_access(
  p_auth_user_id uuid,
  p_name text,
  p_username text,
  p_active boolean,
  p_sources jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_source jsonb;
  v_name text;
  v_key text;
  v_active boolean;
  v_primary boolean;
  v_sort_order integer;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_source_id uuid;
begin
  if p_auth_user_id is null or not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception 'Identidade de autenticação não encontrada.' using errcode = '23503';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Nome do cliente é obrigatório.' using errcode = '22023';
  end if;
  if p_username !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(p_username) < 3 or char_length(p_username) > 63 then
    raise exception 'Username inválido.' using errcode = '22023';
  end if;
  if exists (select 1 from public.clients where slug = p_username)
    or exists (select 1 from public.profiles where username = p_username) then
    raise exception 'Username já está em uso.' using errcode = '23505';
  end if;
  if jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) = 0 then
    raise exception 'Informe ao menos uma origem.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_sources) as source(value)
    where jsonb_typeof(source.value) <> 'object'
      or nullif(btrim(source.value->>'name'), '') is null
      or coalesce(source.value->>'key', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or jsonb_typeof(source.value->'active') <> 'boolean'
      or jsonb_typeof(source.value->'primary') <> 'boolean'
      or jsonb_typeof(source.value->'sortOrder') <> 'number'
  ) then
    raise exception 'Origens inválidas.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_sources) as source(value)
    group by lower(btrim(source.value->>'name'))
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_sources) as source(value)
    group by source.value->>'key'
    having count(*) > 1
  ) then
    raise exception 'Há origens duplicadas.' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_sources) as source(value) where (source.value->>'active')::boolean) then
    raise exception 'Informe ao menos uma origem ativa.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_sources) as source(value) where (source.value->>'active')::boolean and (source.value->>'primary')::boolean) > 1 then
    raise exception 'Informe apenas uma origem principal ativa.' using errcode = '22023';
  end if;

  insert into public.clients (name, slug, active, reporting_started_at)
  values (btrim(p_name), p_username, p_active, v_today)
  returning id into v_client_id;

  insert into public.profiles (id, client_id, username, role, active)
  values (p_auth_user_id, v_client_id, p_username, 'CLIENT'::public.user_role, p_active);

  for v_source in select value from jsonb_array_elements(p_sources) as source(value)
  loop
    v_name := btrim(v_source->>'name');
    v_key := v_source->>'key';
    v_active := (v_source->>'active')::boolean;
    v_primary := v_active and (v_source->>'primary')::boolean;
    v_sort_order := (v_source->>'sortOrder')::integer;

    insert into public.lead_sources (client_id, name, key, is_active, is_primary, sort_order)
    values (v_client_id, v_name, v_key, v_active, v_primary, v_sort_order)
    returning id into v_source_id;

    if v_active then
      insert into public.lead_source_active_periods (lead_source_id, active_from)
      values (v_source_id, v_today);
    end if;
  end loop;

  return v_client_id;
end;
$$;

revoke all on function public.provision_client_with_access(uuid, text, text, boolean, jsonb) from public;
grant execute on function public.provision_client_with_access(uuid, text, text, boolean, jsonb) to service_role;

comment on function public.provision_client_with_access(uuid, text, text, boolean, jsonb) is
  'Provisiona atomicamente o cliente, profile CLIENT e suas origens escolhidas pelo ADMIN.';

commit;
