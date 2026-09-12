begin;

-- Mantém a gravação de uma origem e de seus dados relacionados atômica. O
-- client_id vem exclusivamente do perfil da sessão, nunca do formulário.
create function public.save_daily_report_source(
  p_report_date date,
  p_source_type public.lead_source_type,
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

  if v_client_id is null then
    raise exception 'Usuário sem cliente ativo vinculado.' using errcode = '42501';
  end if;

  if p_report_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Não é permitido criar reporte para uma data futura.' using errcode = '22023';
  end if;

  if p_status = 'NO_CONTACTS' and (
    p_leads_received <> 0 or p_leads_answered <> 0 or p_leads_interested <> 0
    or p_sales <> 0 or p_revenue <> 0
  ) then
    raise exception 'Uma origem sem contatos deve ter métricas zeradas.' using errcode = '22023';
  end if;

  if p_leads_received < 0 or p_leads_answered < 0 or p_leads_interested < 0
    or p_sales < 0 or p_revenue < 0
    or p_leads_answered > p_leads_received
    or p_leads_interested > p_leads_answered
    or p_sales > p_leads_interested then
    raise exception 'As métricas informadas não são válidas.' using errcode = '22023';
  end if;

  if p_sales > 0 and p_revenue = 0 then
    raise exception 'Informe o faturamento das vendas realizadas.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_objections) <> 'array' or jsonb_typeof(p_shipping_cities) <> 'array' then
    raise exception 'Os dados relacionados devem ser listas.' using errcode = '22023';
  end if;

  select coalesce(sum((item->>'quantity')::integer), 0)
  into v_shipping_total
  from jsonb_array_elements(p_shipping_cities) as item;

  if v_shipping_total > p_sales then
    raise exception 'A soma das vendas por cidade não pode superar as vendas realizadas.' using errcode = '22023';
  end if;

  insert into public.daily_reports (client_id, report_date)
  values (v_client_id, p_report_date)
  on conflict (client_id, report_date) do update set updated_at = now()
  returning id into v_daily_report_id;

  insert into public.report_sources (
    daily_report_id, source_type, status, leads_received, leads_answered,
    leads_interested, sales, revenue, notes
  )
  values (
    v_daily_report_id, p_source_type, p_status, p_leads_received,
    p_leads_answered, p_leads_interested, p_sales, p_revenue,
    nullif(btrim(p_notes), '')
  )
  on conflict (daily_report_id, source_type) do update set
    status = excluded.status,
    leads_received = excluded.leads_received,
    leads_answered = excluded.leads_answered,
    leads_interested = excluded.leads_interested,
    sales = excluded.sales,
    revenue = excluded.revenue,
    notes = excluded.notes
  returning id into v_report_source_id;

  delete from public.objections where report_source_id = v_report_source_id;
  delete from public.shipping_cities where report_source_id = v_report_source_id;

  insert into public.objections (report_source_id, type, quantity)
  select
    v_report_source_id,
    (item->>'type')::public.objection_type,
    (item->>'quantity')::integer
  from jsonb_array_elements(p_objections) as item;

  insert into public.shipping_cities (report_source_id, city, state, quantity)
  select
    v_report_source_id,
    btrim(item->>'city'),
    upper(btrim(item->>'state')),
    (item->>'quantity')::integer
  from jsonb_array_elements(p_shipping_cities) as item;

  return v_report_source_id;
end;
$$;

revoke all on function public.save_daily_report_source(
  date, public.lead_source_type, public.report_source_status, integer, integer,
  integer, integer, numeric, text, jsonb, jsonb
) from public;
grant execute on function public.save_daily_report_source(
  date, public.lead_source_type, public.report_source_status, integer, integer,
  integer, integer, numeric, text, jsonb, jsonb
) to authenticated;

commit;
