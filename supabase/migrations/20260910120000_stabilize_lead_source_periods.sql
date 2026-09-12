begin;

-- Corrige apenas origens criadas na mesma transação do cliente pelo
-- provisionamento atual. A igualdade de created_at identifica esse conjunto
-- sem confundir origens adicionadas posteriormente. O UPDATE é idempotente e
-- não toca períodos que já começam corretamente ou que poderiam sobrepor outro.
update public.lead_source_active_periods as period
set active_from = date_trunc('month', client.reporting_started_at)::date
from public.lead_sources as source
join public.clients as client on client.id = source.client_id
where period.lead_source_id = source.id
  and source.created_at = client.created_at
  and period.active_from = client.reporting_started_at
  and not exists (
    select 1
    from public.lead_source_active_periods as other
    where other.lead_source_id = period.lead_source_id
      and other.id <> period.id
      and daterange(other.active_from, other.inactive_from, '[)')
        && daterange(date_trunc('month', client.reporting_started_at)::date, period.inactive_from, '[)')
  );

-- Impede estruturalmente que qualquer caminho futuro crie períodos
-- sobrepostos, inclusive uma escrita administrativa fora da interface.
create function public.prevent_lead_source_active_period_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.lead_source_active_periods as existing
    where existing.lead_source_id = new.lead_source_id
      and existing.id <> new.id
      and daterange(existing.active_from, existing.inactive_from, '[)')
        && daterange(new.active_from, new.inactive_from, '[)')
  ) then
    raise exception 'A origem já possui vigência sobreposta ao período informado.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

create trigger lead_source_active_periods_prevent_overlap
before insert or update on public.lead_source_active_periods
for each row execute function public.prevent_lead_source_active_period_overlap();

-- Origens ativas criadas junto do cliente começam no primeiro dia do mês
-- operacional. reporting_started_at continua guardando a data real de início.
create or replace function public.provision_client_with_access(
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
  v_operational_month_start date;
  v_source_id uuid;
begin
  v_operational_month_start := date_trunc('month', v_today)::date;

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
      values (v_source_id, v_operational_month_start);
    end if;
  end loop;

  return v_client_id;
end;
$$;

comment on function public.provision_client_with_access(uuid, text, text, boolean, jsonb) is
  'Provisiona cliente, profile e origens em uma transação; origens iniciais ativas vigem desde o primeiro dia do mês operacional.';

-- A interface deixa key e sort_order totalmente internos. Em edições eles são
-- preservados; em inclusões, a função gera uma key única e posiciona a origem
-- depois das existentes, sob lock do cliente para evitar corridas.
drop function public.save_lead_source_configuration(uuid, uuid, text, text, integer, boolean, boolean);

create function public.save_lead_source_configuration(
  p_client_id uuid,
  p_source_id uuid,
  p_name text,
  p_is_active boolean,
  p_is_primary boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_was_active boolean;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_base_key text;
  v_key text;
  v_key_suffix integer := 1;
  v_sort_order integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas ADMIN pode configurar origens.' using errcode = '42501';
  end if;

  perform 1 from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = '23503';
  end if;

  if nullif(btrim(p_name), '') is null or (p_is_primary and not p_is_active) then
    raise exception 'Configuração de origem inválida.' using errcode = '22023';
  end if;

  if p_is_primary then
    update public.lead_sources
    set is_primary = false
    where client_id = p_client_id
      and (p_source_id is null or id <> p_source_id);
  end if;

  if p_source_id is null then
    v_base_key := regexp_replace(
      regexp_replace(
        translate(lower(btrim(p_name)), 'áàâãäéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaeeeeiiiiooooouuuucnyy'),
        '[^a-z0-9]+', '-', 'g'
      ),
      '(^-+|-+$)', '', 'g'
    );
    if v_base_key = '' then v_base_key := 'origem'; end if;
    v_key := v_base_key;

    while exists (
      select 1 from public.lead_sources
      where client_id = p_client_id and key = v_key
    ) loop
      v_key_suffix := v_key_suffix + 1;
      v_key := v_base_key || '-' || v_key_suffix::text;
    end loop;

    select coalesce(max(sort_order) + 1, 0)
    into v_sort_order
    from public.lead_sources
    where client_id = p_client_id;

    insert into public.lead_sources (client_id, name, key, is_active, is_primary, sort_order)
    values (p_client_id, btrim(p_name), v_key, p_is_active, p_is_primary, v_sort_order)
    returning id into v_source_id;

    -- Origens adicionadas depois do provisionamento nunca recebem
    -- retroatividade mensal: a vigência começa na data operacional atual.
    if p_is_active then
      insert into public.lead_source_active_periods (lead_source_id, active_from)
      values (v_source_id, v_today);
    end if;
  else
    select is_active
    into v_was_active
    from public.lead_sources
    where id = p_source_id and client_id = p_client_id
    for update;

    if not found then
      raise exception 'Origem não encontrada.' using errcode = '23503';
    end if;

    if v_was_active and not p_is_active and not exists (
      select 1
      from public.lead_sources
      where client_id = p_client_id
        and id <> p_source_id
        and is_active = true
    ) then
      raise exception 'Mantenha ao menos uma origem ativa para o cliente.' using errcode = '22023';
    end if;

    if v_was_active and not p_is_active and exists (
      select 1 from public.lead_source_active_periods
      where lead_source_id = p_source_id
        and inactive_from is null
        and active_from > v_today
    ) then
      raise exception 'A origem possui um período futuro; revise a vigência antes de desativá-la.' using errcode = '22023';
    end if;

    update public.lead_sources
    set
      name = btrim(p_name),
      is_active = p_is_active,
      is_primary = p_is_primary
    where id = p_source_id;

    v_source_id := p_source_id;

    if v_was_active and not p_is_active then
      update public.lead_source_active_periods
      set inactive_from = v_today + 1
      where lead_source_id = v_source_id
        and active_from <= v_today
        and (inactive_from is null or inactive_from > v_today);

      if not found then
        raise exception 'A origem ativa não possui vigência para a data atual.' using errcode = '22023';
      end if;
    elsif not v_was_active and p_is_active then
      -- Reativar no mesmo dia da desativação (ou reconciliar is_active
      -- defasado) reabre o período que já cobre hoje.
      update public.lead_source_active_periods
      set inactive_from = null
      where lead_source_id = v_source_id
        and active_from <= v_today
        and (inactive_from is null or inactive_from > v_today);

      if not found then
        if exists (
          select 1
          from public.lead_source_active_periods
          where lead_source_id = v_source_id
            and active_from > v_today
        ) then
          raise exception 'A origem possui um período futuro; revise a vigência antes de ativá-la.' using errcode = '22023';
        end if;

        insert into public.lead_source_active_periods (lead_source_id, active_from)
        values (v_source_id, v_today);
      end if;
    end if;
  end if;

  return v_source_id;
end;
$$;

revoke all on function public.save_lead_source_configuration(uuid, uuid, text, boolean, boolean) from public;
grant execute on function public.save_lead_source_configuration(uuid, uuid, text, boolean, boolean) to authenticated;

-- Leituras continuam disponíveis conforme RLS, mas mutações autenticadas só
-- podem passar pela função transacional acima. service_role permanece apta ao
-- provisionamento inicial controlado no servidor.
revoke insert, update, delete on public.lead_sources from authenticated;
revoke insert, update, delete on public.lead_source_active_periods from authenticated;

comment on function public.save_lead_source_configuration(uuid, uuid, text, boolean, boolean) is
  'Atualiza origem e vigência atomicamente; gera key e ordenação internamente e aceita apenas ADMIN.';

commit;
