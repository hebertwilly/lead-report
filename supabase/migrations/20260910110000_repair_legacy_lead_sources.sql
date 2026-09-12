begin;

-- Clientes criados antes das origens configuráveis usavam as três origens
-- padrão. Um cliente sem qualquer linha em lead_sources não é um estado que o
-- provisionamento atual consiga criar, portanto pode ser recuperado sem tocar
-- em configurações existentes.
with legacy_clients as (
  select c.id, c.reporting_started_at
  from public.clients as c
  where not exists (
    select 1
    from public.lead_sources as ls
    where ls.client_id = c.id
  )
)
insert into public.lead_sources (client_id, name, key, is_active, is_primary, sort_order)
select legacy_clients.id, defaults.name, defaults.key, true, defaults.is_primary, defaults.sort_order
from legacy_clients
cross join (values
  ('Tráfego Pago'::text, 'trafego-pago'::text, true, 0),
  ('Orgânico'::text, 'organico'::text, false, 1),
  ('Instagram / Links'::text, 'instagram-links'::text, false, 2)
) as defaults(name, key, is_primary, sort_order)
on conflict (client_id, key) do nothing;

-- Uma origem ativa sem período não fica disponível em nenhuma data. Para não
-- antecipar vigência, inicia no primeiro reporte histórico dessa origem ou,
-- quando não houver histórico, no início do acompanhamento do cliente.
insert into public.lead_source_active_periods (lead_source_id, active_from)
select
  ls.id,
  coalesce(min(dr.report_date), c.reporting_started_at)
from public.lead_sources as ls
join public.clients as c on c.id = ls.client_id
left join public.report_sources as rs on rs.lead_source_id = ls.id
left join public.daily_reports as dr on dr.id = rs.daily_report_id
where ls.is_active = true
  and not exists (
    select 1
    from public.lead_source_active_periods as lp
    where lp.lead_source_id = ls.id
  )
group by ls.id, c.reporting_started_at
on conflict (lead_source_id, active_from) do nothing;

-- Mantém a alteração da configuração e de sua vigência na mesma transação.
-- Assim, uma falha ao criar/encerrar um período não deixa is_active divergente
-- do conjunto de datas realmente aplicável ao CLIENT.
create or replace function public.save_lead_source_configuration(
  p_client_id uuid,
  p_source_id uuid,
  p_name text,
  p_key text,
  p_sort_order integer,
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
begin
  if not public.is_admin() then
    raise exception 'Apenas ADMIN pode configurar origens.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Cliente não encontrado.' using errcode = '23503';
  end if;

  if nullif(btrim(p_name), '') is null
    or p_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_sort_order < 0
    or (p_is_primary and not p_is_active) then
    raise exception 'Configuração de origem inválida.' using errcode = '22023';
  end if;

  if p_is_primary then
    update public.lead_sources
    set is_primary = false
    where client_id = p_client_id;
  end if;

  if p_source_id is null then
    insert into public.lead_sources (client_id, name, key, is_active, is_primary, sort_order)
    values (p_client_id, btrim(p_name), p_key, p_is_active, p_is_primary, p_sort_order)
    returning id into v_source_id;

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

    update public.lead_sources
    set
      name = btrim(p_name),
      key = p_key,
      sort_order = p_sort_order,
      is_active = p_is_active,
      is_primary = p_is_primary
    where id = p_source_id;

    v_source_id := p_source_id;

    if v_was_active and not p_is_active then
      -- inactive_from é exclusivo. Somar um dia preserva a vigência do dia em
      -- que a origem foi desativada e evita um período vazio/inválido.
      update public.lead_source_active_periods
      set inactive_from = v_today + 1
      where lead_source_id = v_source_id
        and inactive_from is null
        and active_from <= v_today;
    elsif not v_was_active and p_is_active then
      if exists (
        select 1
        from public.lead_source_active_periods as lp
        where lp.lead_source_id = v_source_id
          and lp.active_from <= v_today
          and (lp.inactive_from is null or lp.inactive_from > v_today)
      ) then
        -- O período já cobre a data atual; somente is_active estava defasado.
        null;
      elsif exists (
        select 1
        from public.lead_source_active_periods as lp
        where lp.lead_source_id = v_source_id
          and lp.active_from > v_today
      ) then
        raise exception 'A origem possui um período futuro; revise a vigência antes de ativá-la.' using errcode = '22023';
      else
        insert into public.lead_source_active_periods (lead_source_id, active_from)
        values (v_source_id, v_today);
      end if;
    end if;
  end if;

  return v_source_id;
end;
$$;

revoke all on function public.save_lead_source_configuration(uuid, uuid, text, text, integer, boolean, boolean) from public;
grant execute on function public.save_lead_source_configuration(uuid, uuid, text, text, integer, boolean, boolean) to authenticated;

comment on function public.save_lead_source_configuration(uuid, uuid, text, text, integer, boolean, boolean) is
  'Atualiza uma origem e seus períodos de vigência atomicamente; uso exclusivo de ADMIN.';

commit;
