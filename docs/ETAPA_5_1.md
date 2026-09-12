# Etapa 5.1 — estabilização e metas do cliente

## Vigência e pendências

`clients.reporting_started_at` continua armazenando a data real em que o acompanhamento começou. A primeira data cobrável é o primeiro dia do mês dessa data, e somente datas anteriores ao dia operacional atual geram pendência.

Origens ativas cadastradas no provisionamento inicial do cliente recebem `active_from = date_trunc('month', reporting_started_at)`. Uma origem adicionada posteriormente começa a vigorar somente na data operacional da inclusão. Desativar encerra a vigência depois do dia da operação; reativar cria um período novo sem sobreposição. Se desativação e reativação acontecerem no mesmo dia, o período encerrado para o dia seguinte é reaberto.

A migration `20260910120000_stabilize_lead_source_periods.sql` corrige conservadoramente as origens iniciais que foram criadas na mesma transação do cliente e cujo primeiro período começou exatamente em `reporting_started_at`. A igualdade entre os `created_at` do cliente e da origem identifica o provisionamento inicial e exclui origens adicionadas depois. O reparo é idempotente, não duplica períodos e não altera uma linha quando a expansão causaria sobreposição.

`save_lead_source_configuration` é o único caminho da interface para incluir, editar, ativar, desativar e reativar uma origem. A função mantém origem e vigência na mesma transação. `key` e `sort_order` não são decisões do ADMIN: a key é gerada com sufixo único, a ordenação nova entra depois das existentes e ambos são preservados em edições. Um trigger impede períodos sobrepostos mesmo em escritas fora da interface.

## Metas mensais

`client_goals` armazena uma linha por versão de meta, com:

- `id uuid`;
- `client_id uuid`, FK restritiva para `clients`;
- `name text`, entre 1 e 120 caracteres úteis;
- `metric_type client_goal_metric_type`;
- `target_value numeric`, positivo, limitado e validado pela precisão da métrica;
- `active boolean`;
- `created_at` e `updated_at`.

O enum aceita `REVENUE`, `SALES`, `AVERAGE_TICKET` e `LEADS`. Vendas e leads exigem valor inteiro. Um índice único parcial em `(client_id, metric_type) where active` impede duas metas ativas do mesmo tipo para um cliente, inclusive em operações concorrentes. Desativação preserva histórico; reativação é bloqueada quando já há outra meta ativa do tipo.

O ADMIN pode ler, criar e atualizar metas de qualquer cliente. O CLIENT não recebe permissão de mutação; a RLS permite somente a leitura das próprias metas ativas, preparada para uso futuro. A Etapa 5.1 não exibe metas no painel CLIENT e não calcula percentual atingido, ritmo, projeção ou gráficos.

## Auditoria de sessão

A autenticação usa apenas o fluxo padrão do Supabase SSR. `createServerClient` persiste a sessão em cookies; na versão instalada do `@supabase/ssr`, as opções padrão relevantes são `path=/`, `sameSite=lax` e `maxAge` de 400 dias. O cliente SSR usa `persistSession=true`. A validade efetiva continua limitada pela expiração e pelas políticas de refresh token configuradas no projeto Supabase.

O middleware cobre as rotas da aplicação e chama `auth.getUser()` por requisição para validar/renovar a sessão e devolver cookies atualizados. Portanto, fechar aba ou navegador não apaga uma sessão ainda válida. O logout ADMIN e CLIENT chama `supabase.auth.signOut`, faz limpeza local como contingência se a revogação global falhar e redireciona para `/login`.

Os guards validam o usuário Auth, o profile ativo e, para CLIENT, o cliente ativo. Quando a sessão está expirada/inválida ou o profile/cliente foi desativado, `/auth/session-invalid` remove os cookies em um Route Handler antes de redirecionar ao login. Assim, uma sessão antiga não volta a dar acesso apenas porque o cadastro foi reativado depois.

A rota `/` e a página `/login` reutilizam essa mesma resolução: uma sessão ADMIN válida segue para `/admin`, uma sessão CLIENT válida segue para `/dashboard` e somente a ausência de sessão permanece no login. Falhas transitórias de `auth.getUser()` e erros nas consultas auxiliares de profile/cliente são estados indisponíveis, não prova de sessão inválida; eles geram erro explícito e nunca acionam a limpeza dos cookies. O próprio `/auth/session-invalid` revalida o estado e redireciona uma sessão válida para sua home, mesmo quando a rota é aberta diretamente.

## Preparação para a Etapa 6

`getActiveClientGoals(clientId)` fornece as metas ativas para consumidores futuros. `getClientGoals(clientId, true)` inclui o histórico para a administração. Nenhum cálculo analítico foi implementado nesta etapa. Futuramente, faturamento, vendas e leads poderão comparar acumulado com meta; ticket médio deverá ser comparado diretamente ao ticket-meta, sem soma cumulativa.
