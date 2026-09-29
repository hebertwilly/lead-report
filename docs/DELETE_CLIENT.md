# Exclusão definitiva de cliente

Somente ADMIN autenticado pode excluir um único cliente em `/admin/clientes/[clientId]?view=settings`. A interface mostra a Zona de perigo, abre uma confirmação modal e exige que o ADMIN digite exatamente o username atual do CLIENT. A confirmação também é verificada novamente no servidor.

## Segurança e escopo

A Server Action resolve a sessão e exige `ADMIN`; ela busca novamente `clients` e `profiles` com credenciais server-side. A operação exige exatamente um profile associado, com `role = CLIENT`, `client_id` igual ao alvo e username confirmado. Qualquer associação ADMIN, zero ou múltiplos profiles interrompe o fluxo. `mestre` e o UUID do profile mestre recebem bloqueio explícito tanto na procedure quanto na confirmação da fila.

## Banco e Auth

`delete_client_permanently` é uma procedure transacional disponível apenas a `service_role`. Antes de alterar dados, ela detecta recursivamente FKs públicas que partem de `clients`; uma dependência futura não prevista faz a operação falhar. Ela remove, sempre com `WHERE` explícito: objections, shipping_cities, report_sources, daily_reports, lead_source_active_periods, lead_sources, client_goals, o profile CLIENT e o client.

Antes do commit, a procedure grava `client_deletion_auth_queue` com o UUID Auth e username. Após o commit, a Server Action chama `supabase.auth.admin.deleteUser` exclusivamente no servidor. Se Auth já estiver ausente, esse estado é aceito. Em falhas, a fila fica preservada para uma nova tentativa segura; ela só pode apontar para o mesmo `client_id`, UUID e username já validados. Nunca há compensação recriando dados do cliente.

O fluxo é idempotente: uma repetição com o cliente já removido só pode finalizar uma pendência correspondente na fila; não seleciona outro usuário Auth. Após a confirmação Auth, a fila é removida e as rotas administrativas são revalidadas.
