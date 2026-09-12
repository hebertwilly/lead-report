begin;

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  name text not null check (char_length(btrim(name)) > 0),
  key text not null,
  is_active boolean not null default true,
  is_primary boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_sources_key_normalized check (
    key = lower(key) and key = btrim(key) and key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint lead_sources_client_key_unique unique (client_id, key)
);

create table public.lead_source_active_periods (
  id uuid primary key default gen_random_uuid(),
  lead_source_id uuid not null references public.lead_sources(id) on delete restrict,
  active_from date not null,
  inactive_from date,
  created_at timestamptz not null default now(),
  constraint lead_source_active_periods_valid check (inactive_from is null or inactive_from > active_from),
  constraint lead_source_active_periods_source_start_unique unique (lead_source_id, active_from)
);

create unique index lead_sources_active_name_unique on public.lead_sources (client_id, lower(name)) where is_active;
create unique index lead_sources_primary_per_client_unique on public.lead_sources (client_id) where is_primary;
create index lead_sources_client_order_idx on public.lead_sources (client_id, sort_order, name);
create index lead_source_active_periods_source_idx on public.lead_source_active_periods (lead_source_id, active_from, inactive_from);

create trigger lead_sources_set_updated_at before update on public.lead_sources
for each row execute function public.set_updated_at();

create function public.create_default_lead_sources_for_client()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_item record;
begin
  for v_item in select * from (values
    ('Tráfego Pago'::text, 'trafego-pago'::text, true, 0),
    ('Orgânico'::text, 'organico'::text, false, 1),
    ('Instagram / Links'::text, 'instagram-links'::text, false, 2)
  ) as defaults(name, key, is_primary, sort_order)
  loop
    insert into public.lead_sources (client_id, name, key, is_primary, sort_order)
    values (new.id, v_item.name, v_item.key, v_item.is_primary, v_item.sort_order)
    on conflict (client_id, key) do update set name = excluded.name
    returning id into v_source_id;

    insert into public.lead_source_active_periods (lead_source_id, active_from)
    values (v_source_id, date '2000-01-01')
    on conflict (lead_source_id, active_from) do nothing;
  end loop;
  return new;
end;
$$;

insert into public.lead_sources (client_id, name, key, is_primary, sort_order)
select c.id, defaults.name, defaults.key, defaults.is_primary, defaults.sort_order
from public.clients as c
cross join (values
  ('Tráfego Pago'::text, 'trafego-pago'::text, true, 0),
  ('Orgânico'::text, 'organico'::text, false, 1),
  ('Instagram / Links'::text, 'instagram-links'::text, false, 2)
) as defaults(name, key, is_primary, sort_order)
on conflict (client_id, key) do nothing;

insert into public.lead_source_active_periods (lead_source_id, active_from)
select id, date '2000-01-01'
from public.lead_sources
on conflict (lead_source_id, active_from) do nothing;

create trigger clients_create_default_lead_sources after insert on public.clients
for each row execute function public.create_default_lead_sources_for_client();

alter table public.report_sources add column lead_source_id uuid references public.lead_sources(id) on delete restrict;

update public.report_sources as rs
set lead_source_id = ls.id
from public.daily_reports as dr, public.lead_sources as ls
where dr.id = rs.daily_report_id
  and ls.client_id = dr.client_id
  and ls.key = case rs.source_type
    when 'PAID_TRAFFIC'::public.lead_source_type then 'trafego-pago'
    when 'ORGANIC'::public.lead_source_type then 'organico'
    when 'INSTAGRAM_LINKS'::public.lead_source_type then 'instagram-links'
  end;

alter table public.report_sources alter column lead_source_id set not null;
alter table public.report_sources alter column source_type drop not null;
alter table public.report_sources drop constraint report_sources_report_source_type_key;
alter table public.report_sources add constraint report_sources_report_lead_source_key unique (daily_report_id, lead_source_id);
create index report_sources_lead_source_id_idx on public.report_sources (lead_source_id);

alter table public.lead_sources enable row level security;
alter table public.lead_source_active_periods enable row level security;

create policy "Admins manage lead sources" on public.lead_sources
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients view their lead sources" on public.lead_sources
for select to authenticated using (client_id = public.current_active_client_id());
create policy "Admins manage lead source periods" on public.lead_source_active_periods
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Clients view their lead source periods" on public.lead_source_active_periods
for select to authenticated using (exists (
  select 1 from public.lead_sources as ls
  where ls.id = lead_source_id and ls.client_id = public.current_active_client_id()
));

grant select, insert, update, delete on public.lead_sources to authenticated;
grant select, insert, update, delete on public.lead_source_active_periods to authenticated;
grant select, insert, update, delete on public.lead_sources to service_role;
grant select, insert, update, delete on public.lead_source_active_periods to service_role;
grant select, update on public.report_sources to service_role;

drop function public.save_daily_report_source(
  date, public.lead_source_type, public.report_source_status, integer, integer,
  integer, integer, numeric, text, jsonb, jsonb
);

create function public.save_daily_report_source(
  p_report_date date,
  p_lead_source_id uuid,
  p_status public.report_source_status,
  p_leads_received integer,
  p_leads_answered integer,
  p_leads_interested integer,
  p_sales integer,
  p_revenue numeric,
  p_notes text,
  p_objections jsonb,
  p_shipping_cities jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_daily_report_id uuid;
  v_report_source_id uuid;
  v_shipping_total integer;
begin
  v_client_id := public.current_active_client_id();
  if v_client_id is null then raise exception 'Usuário sem cliente ativo vinculado.' using errcode = '42501'; end if;
  if p_report_date > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Não é permitido criar reporte para uma data futura.' using errcode = '22023'; end if;

  if not exists (
    select 1
    from public.lead_sources as ls
    join public.lead_source_active_periods as lp on lp.lead_source_id = ls.id
    where ls.id = p_lead_source_id
      and ls.client_id = v_client_id
      and lp.active_from <= p_report_date
      and (lp.inactive_from is null or lp.inactive_from > p_report_date)
  ) then raise exception 'A origem informada não está disponível para esta data.' using errcode = '42501'; end if;

  if p_status = 'NO_CONTACTS' and (p_leads_received <> 0 or p_leads_answered <> 0 or p_leads_interested <> 0 or p_sales <> 0 or p_revenue <> 0) then raise exception 'Uma origem sem contatos deve ter métricas zeradas.' using errcode = '22023'; end if;
  if p_leads_received < 0 or p_leads_answered < 0 or p_leads_interested < 0 or p_sales < 0 or p_revenue < 0 or p_leads_answered > p_leads_received or p_leads_interested > p_leads_answered or p_sales > p_leads_interested then raise exception 'As métricas informadas não são válidas.' using errcode = '22023'; end if;
  if p_sales > 0 and p_revenue = 0 then raise exception 'Informe o faturamento das vendas realizadas.' using errcode = '22023'; end if;
  if jsonb_typeof(p_objections) <> 'array' or jsonb_typeof(p_shipping_cities) <> 'array' then raise exception 'Os dados relacionados devem ser listas.' using errcode = '22023'; end if;

  select coalesce(sum((item->>'quantity')::integer), 0) into v_shipping_total from jsonb_array_elements(p_shipping_cities) as item;
  if v_shipping_total > p_sales then raise exception 'A soma das vendas por cidade não pode superar as vendas realizadas.' using errcode = '22023'; end if;

  insert into public.daily_reports (client_id, report_date) values (v_client_id, p_report_date)
  on conflict (client_id, report_date) do update set updated_at = now() returning id into v_daily_report_id;

  insert into public.report_sources (daily_report_id, lead_source_id, status, leads_received, leads_answered, leads_interested, sales, revenue, notes)
  values (v_daily_report_id, p_lead_source_id, p_status, p_leads_received, p_leads_answered, p_leads_interested, p_sales, p_revenue, nullif(btrim(p_notes), ''))
  on conflict (daily_report_id, lead_source_id) do update set
    status = excluded.status, leads_received = excluded.leads_received, leads_answered = excluded.leads_answered,
    leads_interested = excluded.leads_interested, sales = excluded.sales, revenue = excluded.revenue, notes = excluded.notes
  returning id into v_report_source_id;

  delete from public.objections where report_source_id = v_report_source_id;
  delete from public.shipping_cities where report_source_id = v_report_source_id;
  insert into public.objections (report_source_id, type, quantity)
  select v_report_source_id, (item->>'type')::public.objection_type, (item->>'quantity')::integer from jsonb_array_elements(p_objections) as item;
  insert into public.shipping_cities (report_source_id, city, state, quantity)
  select v_report_source_id, btrim(item->>'city'), upper(btrim(item->>'state')), (item->>'quantity')::integer from jsonb_array_elements(p_shipping_cities) as item;
  return v_report_source_id;
end;
$$;

revoke all on function public.save_daily_report_source(date, uuid, public.report_source_status, integer, integer, integer, integer, numeric, text, jsonb, jsonb) from public;
grant execute on function public.save_daily_report_source(date, uuid, public.report_source_status, integer, integer, integer, integer, numeric, text, jsonb, jsonb) to authenticated;

commit;
