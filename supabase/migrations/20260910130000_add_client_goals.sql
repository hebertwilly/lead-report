begin;

create type public.client_goal_metric_type as enum (
  'REVENUE',
  'SALES',
  'AVERAGE_TICKET',
  'LEADS'
);

create table public.client_goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  name text not null,
  metric_type public.client_goal_metric_type not null,
  target_value numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_goals_name_valid check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint client_goals_target_valid check (
    target_value > 0
    and target_value <= 999999999999.99
    and (
      (
        metric_type in (
          'SALES'::public.client_goal_metric_type,
          'LEADS'::public.client_goal_metric_type
        )
        and target_value = trunc(target_value)
      )
      or (
        metric_type in (
          'REVENUE'::public.client_goal_metric_type,
          'AVERAGE_TICKET'::public.client_goal_metric_type
        )
        and target_value = round(target_value, 2)
      )
    )
  )
);

create unique index client_goals_one_active_metric_per_client_idx
on public.client_goals (client_id, metric_type)
where active;

create index client_goals_client_created_idx
on public.client_goals (client_id, created_at desc);

create trigger client_goals_set_updated_at
before update on public.client_goals
for each row execute function public.set_updated_at();

alter table public.client_goals enable row level security;

create policy "Admins manage client goals" on public.client_goals
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- A leitura fica pronta para a Etapa 6, mas a Etapa 5.1 não exibe metas ao
-- CLIENT. Metas inativas permanecem visíveis somente ao ADMIN.
create policy "Clients view their active goals" on public.client_goals
for select to authenticated
using (
  active = true
  and client_id = public.current_active_client_id()
);

grant select, insert, update on public.client_goals to authenticated;

comment on table public.client_goals is
  'Metas mensais por cliente. A V1 limita uma meta ativa por métrica e preserva versões inativas como histórico.';
comment on column public.client_goals.target_value is
  'Valor mensal em BRL para REVENUE/AVERAGE_TICKET e quantidade inteira para SALES/LEADS.';

commit;
