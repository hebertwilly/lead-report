begin;

-- Os scripts administrativos usam a service_role. Ela ignora RLS, mas ainda
-- precisa de privilégios SQL explícitos para acessar as tabelas de domínio.
grant select, insert, update, delete on public.clients to service_role;
grant select, insert, update, delete on public.profiles to service_role;

commit;
