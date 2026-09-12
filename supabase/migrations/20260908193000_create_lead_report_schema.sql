begin;

create extension if not exists pgcrypto;

create type public.user_role as enum ('ADMIN', 'CLIENT');
create type public.lead_source_type as enum ('PAID_TRAFFIC', 'ORGANIC', 'INSTAGRAM_LINKS');
create type public.report_source_status as enum ('PENDING', 'FILLED', 'NO_CONTACTS');
create type public.objection_type as enum (
  'NO_RESPONSE',
  'PRICE',
  'SHIPPING',
  'PRODUCT_UNAVAILABLE',
  'PAYMENT_METHOD',
  'THINKING',
  'NO_INTEREST',
  'OTHER'
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_slug_normalized check (
    slug = lower(slug)
    and slug = btrim(slug)
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  username text not null unique,
  role public.user_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_normalized check (
    username = lower(username)
    and username = btrim(username)
    and username ~ '^[a-z0-9][a-z0-9._-]{2,62}$'
  ),
  constraint profiles_role_client_id check (
    (role = 'ADMIN' and client_id is null)
    or (role = 'CLIENT' and client_id is not null)
  )
);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  report_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_reports_client_date_key unique (client_id, report_date)
);

create table public.report_sources (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete restrict,
  source_type public.lead_source_type not null,
  status public.report_source_status not null default 'PENDING',
  leads_received integer not null default 0,
  leads_answered integer not null default 0,
  leads_interested integer not null default 0,
  sales integer not null default 0,
  revenue numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_sources_report_source_type_key unique (daily_report_id, source_type),
  constraint report_sources_metric_values_valid check (
    leads_received >= 0
    and leads_answered >= 0
    and leads_interested >= 0
    and sales >= 0
    and revenue >= 0
    and leads_answered <= leads_received
    and leads_interested <= leads_answered
    and sales <= leads_interested
  )
);

create table public.objections (
  id uuid primary key default gen_random_uuid(),
  report_source_id uuid not null references public.report_sources(id) on delete restrict,
  type public.objection_type not null,
  quantity integer not null default 0 check (quantity >= 0),
  constraint objections_report_source_type_key unique (report_source_id, type)
);

create table public.shipping_cities (
  id uuid primary key default gen_random_uuid(),
  report_source_id uuid not null references public.report_sources(id) on delete restrict,
  city text not null check (char_length(btrim(city)) > 0),
  state char(2) not null,
  quantity integer not null check (quantity > 0),
  constraint shipping_cities_state_valid check (state = upper(state) and state ~ '^[A-Z]{2}$')
);

create index profiles_client_id_idx on public.profiles (client_id) where client_id is not null;
create index daily_reports_report_date_idx on public.daily_reports (report_date);
create index shipping_cities_report_source_id_idx on public.shipping_cities (report_source_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_set_updated_at before update on public.clients
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger daily_reports_set_updated_at before update on public.daily_reports
for each row execute function public.set_updated_at();
create trigger report_sources_set_updated_at before update on public.report_sources
for each row execute function public.set_updated_at();

-- Security-definer helpers read profiles without causing a policy to recurse.
create function public.current_active_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = auth.uid() and p.active = true
$$;

create function public.current_active_client_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.client_id
  from public.profiles as p
  join public.clients as c on c.id = p.client_id
  where p.id = auth.uid()
    and p.role = 'CLIENT'::public.user_role
    and p.active = true
    and c.active = true
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_active_role() = 'ADMIN'::public.user_role, false)
$$;

create function public.can_access_daily_report(target_daily_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1
    from public.daily_reports as dr
    where dr.id = target_daily_report_id
      and dr.client_id = public.current_active_client_id()
  )
$$;

create function public.can_access_report_source(target_report_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1
    from public.report_sources as rs
    join public.daily_reports as dr on dr.id = rs.daily_report_id
    where rs.id = target_report_source_id
      and dr.client_id = public.current_active_client_id()
  )
$$;

revoke all on function public.current_active_role() from public;
revoke all on function public.current_active_client_id() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_access_daily_report(uuid) from public;
revoke all on function public.can_access_report_source(uuid) from public;
grant execute on function public.current_active_role() to authenticated;
grant execute on function public.current_active_client_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_daily_report(uuid) to authenticated;
grant execute on function public.can_access_report_source(uuid) to authenticated;

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.daily_reports enable row level security;
alter table public.report_sources enable row level security;
alter table public.objections enable row level security;
alter table public.shipping_cities enable row level security;

create policy "Admins manage clients" on public.clients
for all to authenticated
using (public.is_admin())
with check (public.is_admin());
create policy "Clients view their active client" on public.clients
for select to authenticated
using (id = public.current_active_client_id());

create policy "Admins manage profiles" on public.profiles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());
create policy "Users view their own profile" on public.profiles
for select to authenticated
using (id = auth.uid());

create policy "Authorized users manage accessible daily reports" on public.daily_reports
for all to authenticated
using (public.is_admin() or client_id = public.current_active_client_id())
with check (public.is_admin() or client_id = public.current_active_client_id());

create policy "Authorized users manage accessible report sources" on public.report_sources
for all to authenticated
using (public.can_access_daily_report(daily_report_id))
with check (public.can_access_daily_report(daily_report_id));

create policy "Authorized users manage accessible objections" on public.objections
for all to authenticated
using (public.can_access_report_source(report_source_id))
with check (public.can_access_report_source(report_source_id));

create policy "Authorized users manage accessible shipping cities" on public.shipping_cities
for all to authenticated
using (public.can_access_report_source(report_source_id))
with check (public.can_access_report_source(report_source_id));

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.daily_reports to authenticated;
grant select, insert, update, delete on public.report_sources to authenticated;
grant select, insert, update, delete on public.objections to authenticated;
grant select, insert, update, delete on public.shipping_cities to authenticated;

commit;
