# Banco de dados planejado

O schema desta V1 foi implementado em `supabase/migrations/20260908193000_create_lead_report_schema.sql`. Aplique a migration com a Supabase CLI para criar o banco em outro ambiente.

## Tabelas

### `clients`

| Coluna | Observação |
| --- | --- |
| `id` | Identificador primário UUID. |
| `name` | Nome do cliente. |
| `slug` | Identificador único, normalizado em minúsculas. |
| `active` | Cliente ativo ou desativado pelo ADMIN. |
| `reporting_started_at` | Data em que o acompanhamento do cliente iniciou. Recebe a data operacional atual por padrão; para registros existentes é preenchida a partir de `created_at`. |
| `created_at`, `updated_at` | Auditoria temporal. |

Para um CLIENT, `slug` recebe o mesmo username normalizado de `profiles.username`. O slug não substitui o UUID nas FKs e não é editável na V1.

### `profiles`

| Coluna | Observação |
| --- | --- |
| `id` | PK e FK para `auth.users.id`. |
| `client_id` | FK para `clients.id`; nulo para ADMIN. |
| `username` | Identificador de usuário exibido/administrado. Deve ser único. |
| `login_username` | Chave canônica gerada a partir de `username`, usada exclusivamente para resolver o login sem alterar acessos legados. Única. |
| `role` | Enum `ADMIN` ou `CLIENT`. |
| `active` | Perfil ativo ou desativado. |
| `onboarding_completed_at` | Data/hora de conclusão do tutorial; nula enquanto o CLIENT ainda não o concluiu. |
| `created_at`, `updated_at` | Auditoria temporal. |

Regra de integridade planejada: ADMIN deve ter `client_id` nulo; CLIENT deve ter `client_id` preenchido.

### `daily_reports`

| Coluna | Observação |
| --- | --- |
| `id` | PK UUID. |
| `client_id` | FK para `clients.id`. |
| `report_date` | Data do reporte, sem horário. |
| `created_at`, `updated_at` | Auditoria temporal. |

Constraint: `unique (client_id, report_date)`.

### `report_sources`

| Coluna | Observação |
| --- | --- |
| `id` | PK UUID. |
| `daily_report_id` | FK para `daily_reports.id`. |
| `lead_source_id` | FK para a origem configurável do cliente. |
| `status` | Enum `PENDING`, `FILLED` ou `NO_CONTACTS`; inicia em `PENDING`. |
| `leads_received`, `leads_answered`, `leads_interested`, `sales` | Contadores inteiros. |
| `revenue` | Faturamento em BRL, `numeric(12,2)` e não negativo. |
| `notes` | Observação opcional. |
| `created_at`, `updated_at` | Auditoria temporal. |

Constraint: `unique (daily_report_id, lead_source_id)`. `source_type` é mantido apenas como legado da migração inicial. Checks: valores não negativos, `leads_answered <= leads_received`, `leads_interested <= leads_answered` e `sales <= leads_interested`.

### `lead_sources` e vigência

`lead_sources` pertence a um cliente e armazena `name`, `key`, `is_active`, `is_primary` e `sort_order`. Seus períodos ativos são registrados em `lead_source_active_periods`, permitindo desativar e reativar sem alterar retroativamente a completude de reportes antigos ou criar pendências antes da vigência da origem.

Novos clientes são provisionados pela função `provision_client_with_access`, que cria as origens escolhidas pelo ADMIN na mesma transação do cliente e do profile. O antigo trigger de origens padrão foi removido; dados e origens de clientes existentes são preservados.

A migration `20260910110000_repair_legacy_lead_sources.sql` recupera de forma idempotente clientes legados sem nenhuma origem, usando o conjunto padrão que existia antes das origens configuráveis. Ela também cria um período apenas para origens ativas que não possuíam nenhum, iniciando no primeiro reporte histórico da própria origem ou em `reporting_started_at`. As alterações administrativas posteriores usam `save_lead_source_configuration`, que atualiza a origem e a vigência na mesma transação.

### `objections`

| Coluna | Observação |
| --- | --- |
| `id` | PK UUID. |
| `report_source_id` | FK para `report_sources.id`. |
| `type` | Enum de objeção. |
| `quantity` | Inteiro não negativo. |

Constraint implementada: `unique (report_source_id, type)` para uma linha por motivo e origem.

### `shipping_cities`

| Coluna | Observação |
| --- | --- |
| `id` | PK UUID. |
| `report_source_id` | FK para `report_sources.id`. |
| `city` | Cidade de destino. |
| `state` | UF de destino. |
| `quantity` | Inteiro positivo. |

A soma das quantidades não pode exceder `report_sources.sales`. Na V1, essa regra é responsabilidade da aplicação, que deverá validar a operação em transação; não foi criado trigger de agregação no banco.

## Enums planejados

```text
user_role: ADMIN | CLIENT
lead_source_type: PAID_TRAFFIC | ORGANIC | INSTAGRAM_LINKS
report_source_status: PENDING | FILLED | NO_CONTACTS
objection_type: NO_RESPONSE | PRICE | SHIPPING | PRODUCT_UNAVAILABLE |
                PAYMENT_METHOD | THINKING | NO_INTEREST | OTHER
```

## Relacionamentos

```text
auth.users 1—1 profiles
clients 1—N profiles (somente CLIENT)
clients 1—N daily_reports
daily_reports 1—N report_sources
report_sources 1—N objections
report_sources 1—N shipping_cities
```

## Estratégia de RLS

RLS está ativada em todas as tabelas de domínio. As políticas se baseiam no perfil autenticado, sem aceitar um `client_id` fornecido pelo cliente como prova de autorização.

- ADMIN autenticado e ativo: leitura e mutações administrativas permitidas sobre todos os clientes e dados.
- CLIENT autenticado e ativo: leitura e mutações somente quando a linha pertence ao `profiles.client_id` do próprio usuário e o cliente está ativo.
- `profiles`: o cliente não pode elevar papel, trocar vínculo de cliente, nome de usuário ou status. A administração de credenciais e perfis é restrita ao ADMIN/fluxo de servidor seguro.
- Clientes ou perfis inativos devem ser bloqueados conforme o fluxo de autenticação e as políticas de acesso.

As funções `current_active_role`, `current_active_client_id`, `is_admin`, `can_access_daily_report` e `can_access_report_source` são `security definer`, possuem `search_path` vazio e têm execução concedida apenas a `authenticated`. Elas evitam recursão de RLS em `profiles` e são usadas nas policies das tabelas filhas.

`complete_client_onboarding` também é uma função `security definer`, mas atualiza exclusivamente `onboarding_completed_at` do próprio CLIENT ativo identificado por `auth.uid()`. Não há política nem privilégio que permita ao CLIENT atualizar livremente o perfil.

## Integridade, índices e exclusão

- `profiles` exige `client_id` nulo para ADMIN e preenchido para CLIENT; usernames são minúsculos, sem espaços e únicos. `login_username` é gerado pela normalização atual e evita que usernames legados com ponto ou sublinhado levem a outra identidade Auth.
- `daily_reports` possui unicidade por `(client_id, report_date)`; não há check de data futura porque checks com `current_date` não são estáveis ao longo do tempo. A aplicação validará a data no fuso America/Sao_Paulo.
- `report_sources` valida todos os contadores, a cadeia de funil, faturamento em BRL e a unicidade de origem por reporte.
- UF de `shipping_cities` é obrigatoriamente duas letras maiúsculas; quantidade é positiva.
- Índices adicionais existem em `profiles.client_id`, `daily_reports.report_date` e `shipping_cities.report_source_id`. As constraints únicas já atendem consultas por `daily_reports.client_id`, `report_sources.daily_report_id` e `objections.report_source_id`, por isso não há índices redundantes.
- Todas as FKs usam `ON DELETE RESTRICT`: clientes e dados comerciais devem ser desativados, não excluídos. Não há `CASCADE` para evitar destruição acidental de histórico.
- A função `set_updated_at` e seus triggers atualizam `updated_at` em `clients`, `profiles`, `daily_reports` e `report_sources`.

## Persistência atômica do reporte

A migration `20260908210000_add_report_source_save_function.sql` cria `save_daily_report_source`. A função obtém o cliente por `current_active_client_id()`, impede datas futuras no fuso America/Sao_Paulo, aplica as validações de métricas e de envios e cria/atualiza o `daily_report` e a `report_source`. Objeções e cidades da origem são substituídas na mesma transação, evitando duplicidades durante edição.
