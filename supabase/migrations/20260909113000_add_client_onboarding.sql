begin;

alter table public.profiles
add column onboarding_completed_at timestamptz;

-- O CLIENT não recebe privilégio direto de UPDATE em profiles. Esta função só
-- permite concluir o próprio onboarding e preserva os demais campos do perfil.
create function public.complete_client_onboarding()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
begin
  update public.profiles as p
  set onboarding_completed_at = coalesce(p.onboarding_completed_at, now())
  where p.id = auth.uid()
    and p.role = 'CLIENT'::public.user_role
    and p.active = true
    and exists (
      select 1
      from public.clients as c
      where c.id = p.client_id and c.active = true
    )
  returning p.onboarding_completed_at into v_completed_at;

  if v_completed_at is null then
    raise exception 'Cliente ativo não encontrado.' using errcode = '42501';
  end if;

  return v_completed_at;
end;
$$;

revoke all on function public.complete_client_onboarding() from public;
grant execute on function public.complete_client_onboarding() to authenticated;

commit;
