begin;

alter table public.clients
add column whatsapp_phone text null;

alter table public.clients
add constraint clients_whatsapp_phone_normalized
check (
  whatsapp_phone is null
  or whatsapp_phone ~ '^[1-9][0-9]{9,14}$'
);

comment on column public.clients.whatsapp_phone is
  'Telefone do WhatsApp em formato internacional, somente dígitos: DDI + DDD + número.';

-- Mantém o provisionamento original intacto e adiciona uma assinatura usada
-- pelo cadastro administrativo para persistir o telefone na mesma transação.
create function public.provision_client_with_access(
  p_auth_user_id uuid,
  p_name text,
  p_username text,
  p_active boolean,
  p_sources jsonb,
  p_whatsapp_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  if p_whatsapp_phone is not null
    and p_whatsapp_phone !~ '^[1-9][0-9]{9,14}$' then
    raise exception 'WhatsApp deve conter somente DDI, DDD e número.' using errcode = '22023';
  end if;

  v_client_id := public.provision_client_with_access(
    p_auth_user_id,
    p_name,
    p_username,
    p_active,
    p_sources
  );

  update public.clients
  set whatsapp_phone = p_whatsapp_phone
  where id = v_client_id;

  return v_client_id;
end;
$$;

revoke all on function public.provision_client_with_access(uuid, text, text, boolean, jsonb, text) from public;
grant execute on function public.provision_client_with_access(uuid, text, text, boolean, jsonb, text) to service_role;

comment on function public.provision_client_with_access(uuid, text, text, boolean, jsonb, text) is
  'Provisiona cliente, profile, origens e WhatsApp normalizado em uma única transação.';

commit;
