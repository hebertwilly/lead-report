begin;

-- A identidade usada para localizar um profile no login é canônica, mas o
-- username original permanece imutável para compatibilidade com acessos
-- criados antes da regra atual, que permitia ponto e sublinhado.
create function public.normalize_login_username(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(value)), '[[:space:]]+', '-', 'g'),
        '[^a-z0-9-]', '', 'g'
      ),
      '-+', '-', 'g'
    ),
    '(^-+|-+$)', '', 'g'
  )
$$;

alter table public.profiles
add column login_username text generated always as (public.normalize_login_username(username)) stored;

-- Uma colisão (por exemplo, cliente.teste e cliente-teste) não é corrigida
-- silenciosamente: ela exige reconciliação explícita antes de ativar o índice.
do $$
begin
  if exists (
    select 1
    from public.profiles
    group by login_username
    having count(*) > 1
  ) then
    raise exception 'Há usernames legados que colidem após a normalização de login. Reconcilie-os explicitamente antes de aplicar esta migration.';
  end if;
end;
$$;

alter table public.profiles
add constraint profiles_login_username_key unique (login_username),
add constraint profiles_login_username_valid check (
  login_username ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  and char_length(login_username) between 3 and 63
);

comment on column public.profiles.login_username is
  'Identificador canônico de login, derivado de username. Preserva usernames legados como cliente.teste sem reconstruir a identidade Auth.';

commit;
