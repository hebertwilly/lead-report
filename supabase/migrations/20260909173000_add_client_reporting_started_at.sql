begin;

alter table public.clients
  add column reporting_started_at date;

update public.clients
set reporting_started_at = (created_at at time zone 'America/Sao_Paulo')::date
where reporting_started_at is null;

alter table public.clients
  alter column reporting_started_at set not null,
  alter column reporting_started_at set default ((now() at time zone 'America/Sao_Paulo')::date);

comment on column public.clients.reporting_started_at is
  'Data em que o cliente iniciou acompanhamento; pendências começam no primeiro dia deste mês.';

commit;
