# Limpeza segura dos dados de teste

## Objetivo

O procedimento administrativo remove todos os dados pertencentes a clientes antes do uso real do Lead Report. Ele preserva o schema, migrations, enums, funções, triggers, RLS, policies, configurações e todos os profiles `ADMIN`. O profile e o usuário Auth do ADMIN `mestre` são obrigatoriamente validados e preservados.

Este procedimento é destrutivo. Execute primeiro o dry-run e confira o projeto indicado pela URL.

## O que é removido

A migration `20260914160000_add_reset_test_data_procedure.sql` cobre as tabelas atuais, respeitando as FKs `ON DELETE RESTRICT`, nesta ordem:

1. `objections`;
2. `shipping_cities`;
3. `report_sources`;
4. `daily_reports`;
5. `lead_source_active_periods`;
6. `lead_sources`;
7. `client_goals`;
8. linhas `CLIENT` de `profiles`;
9. `clients`.

Depois do commit transacional, o script remove pela Admin API apenas os usuários `auth.users` cujos UUIDs vieram de profiles `CLIENT`. Profiles e usuários Auth `ADMIN` não são selecionados para remoção.

## Proteção do ADMIN mestre

Antes do dry-run e da execução real, a função SQL:

- procura exatamente `profiles.username = 'mestre'`;
- exige exatamente uma linha;
- exige `role = 'ADMIN'` e `client_id` nulo;
- confirma que `profiles.id` existe como `auth.users.id`;
- na execução real, exige o mesmo UUID validado na prévia;
- falha antes de qualquer `DELETE` se uma dessas condições não for atendida.

O script confirma novamente a presença desse UUID pela Admin API e nunca usa apenas o texto `mestre` para decidir qual usuário Auth preservar.

## Segurança e transação

`reset_test_client_data` é uma função `security definer` com execução concedida somente a `service_role`. A execução real bloqueia as tabelas envolvidas durante a transação, enfileira os UUIDs Auth e faz os deletes em uma única transação PostgreSQL. Uma falha em qualquer delete reverte toda a limpeza do banco.

A função também descobre recursivamente as tabelas públicas ligadas a `clients` por FKs. Se uma migration futura adicionar uma tabela não prevista, o procedimento falha antes de apagar qualquer dado e precisa ser atualizado.

A remoção do Supabase Auth ocorre necessariamente depois do commit, pela Admin API oficial. A tabela técnica `reset_test_data_auth_queue` mantém apenas UUID e username até cada ausência no Auth ser confirmada. Se houver falha de rede ou interrupção nessa etapa, uma nova execução retoma os usuários pendentes de forma idempotente. Quando tudo termina corretamente, a fila fica vazia.

Não é usado `TRUNCATE CASCADE`.

## Requisitos

1. Revise e aplique a migration nova no projeto Supabase correto:

   ```bash
   npx supabase db push
   ```

2. Disponibilize estas variáveis somente no terminal/server-side:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=valor-secreto
   ```

O script tenta carregar `.env.local` quando o Node oferece `process.loadEnvFile`; variáveis já definidas no processo continuam sendo a fonte preferencial. A service role nunca é impressa e nunca deve usar prefixo `NEXT_PUBLIC_`.

Use uma versão atual do Node compatível com o projeto e execute o comando a partir da raiz do repositório.

## Dry-run obrigatório como primeiro passo

Execute:

```bash
npm run reset:test-data:dry
```

Equivalente direto:

```bash
node scripts/reset-test-data.mjs --dry-run
```

O dry-run não pede confirmação e não faz inserts, updates, deletes nem chamadas de exclusão no Auth. Ele mostra:

- Supabase URL;
- ADMIN mestre preservado, UUID, role, status e presença no Auth;
- quantidade e lista de clients;
- quantidade e usernames dos profiles CLIENT;
- registros por tabela;
- UUIDs Auth CLIENT encontrados ou já ausentes;
- itens eventualmente pendentes na fila técnica.

Exemplo resumido de saída:

```text
Modo: DRY-RUN (nenhum dado será apagado)
Supabase URL: https://projeto.supabase.co
ADMIN preservado:
- username: mestre
- id: 00000000-0000-0000-0000-000000000000
- role: ADMIN
- usuário Auth correspondente: encontrado
Quantidade de clients: 4
Quantidade de profiles CLIENT: 4
Quantidade de usuários Auth CLIENT encontrados: 4
Quantidade de registros por tabela:
- report_sources: 4
- clients: 4
Dry-run concluído. Nenhum dado foi alterado.
```

O script não mostra service role, tokens, senhas, refresh tokens nem e-mails técnicos.

## Execução real

Depois de revisar o dry-run:

```bash
npm run reset:test-data
```

Equivalente direto:

```bash
node scripts/reset-test-data.mjs
```

O script repete toda a inspeção e mostra novamente o ambiente. Para continuar, digite exatamente:

```text
RESET CLIENT DATA
```

`y`, `yes`, `sim`, diferenças de caixa, espaços extras ou qualquer outro texto cancelam a operação sem alterar dados.

## Validação pós-limpeza

Ao final, o script executa outra inspeção e exige:

- `clients = 0`;
- profiles `CLIENT = 0`;
- todas as tabelas relacionadas a cliente com zero linhas;
- fila técnica Auth vazia;
- profile `mestre` existente, ainda `ADMIN` e com o mesmo UUID da prévia;
- usuário Auth do mestre existente;
- todos os UUIDs Auth CLIENT capturados ausentes.

Se nada precisar ser removido, a execução informa `Nenhum dado de cliente para remover.` e ainda valida a integridade do mestre. Executar novamente após uma limpeza concluída não altera nada.

## Riscos e recuperação

- Confirme cuidadosamente a `Supabase URL`: a service role ignora RLS.
- Não execute enquanto houver provisionamento ou gravação de reportes em andamento. A transação usa locks exclusivos para impedir uma limpeza parcial, mas operações concorrentes podem aguardar ou falhar.
- A transação do banco e a Admin API Auth não podem compartilhar o mesmo commit. A fila técnica torna essa fronteira recuperável; se a etapa Auth falhar, leia o erro e execute novamente o mesmo procedimento.
- Uma tabela futura relacionada a cliente bloqueia a operação até que a ordem e as validações sejam revisadas.
- Nunca copie a service role para código cliente, logs, tickets ou documentação versionada.
