# Arquitetura

## Stack

- Next.js com App Router e TypeScript.
- Tailwind CSS, shadcn/ui e Lucide para interface.
- Supabase com PostgreSQL, Supabase Auth e `@supabase/ssr`.
- Recharts para gráficos futuros.
- Implantação futura na Vercel.

## Estrutura atual

```text
src/
  app/                 # Rotas, layouts e estilos globais
  components/
    admin/             # Configurações e dashboard analítica por cliente
    auth/              # UI de autenticação
    history/           # Filtro de período do Histórico CLIENT
    layout/            # Layouts reutilizáveis
    reports/           # Formulário interativo do reporte diário
    ui/                # Primitivos compatíveis com shadcn/ui
  lib/
    analytics/         # Consultas em lote e cálculos puros de análise, comparação e metas
    auth/              # Identidade técnica, sessão e guards server-side
    config/            # Configurações públicas centralizadas da aplicação
    reports/           # Consultas, constantes e regras de apresentação dos reportes
    supabase/          # Clientes Supabase de browser e servidor
    whatsapp/          # Normalização, mensagem de cobrança e URL wa.me
    utils.ts           # Utilitário cn
  types/               # Tipos compartilhados de domínio
```

O alias `@/*` aponta para `src/*`. A rota raiz redireciona para `/login`. As rotas de sessão ficam em `src/app/(auth)` e as rotas protegidas em `src/app/(protected)`.

## Componentes de servidor e cliente

Use Server Components por padrão para páginas, layouts, leituras de dados e composição de UI. Componentes Client devem ser isolados e usados apenas quando houver estado local, eventos, hooks, bibliotecas de gráfico, APIs do navegador ou interação que realmente dependa do cliente.

Formulários futuros devem validar no servidor e no cliente para boa experiência, mas a validação do servidor é a autoridade. Regras persistentes e isolamento de dados devem ser reforçados no PostgreSQL/RLS.

## Supabase

Há dois factories de cliente:

- `src/lib/supabase/client.ts`: cliente de navegador com `createBrowserClient`.
- `src/lib/supabase/server.ts`: cliente de servidor com cookies do App Router e `createServerClient`.

As variáveis permitidas no browser são `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` é usada exclusivamente no servidor pelos fluxos administrativos e pela resolução de identidade no login; ela nunca é importada por código de browser.

`src/middleware.ts` renova a sessão por cookies com `@supabase/ssr`. Server Actions realizam login e logout. As páginas protegidas obtêm a sessão e o perfil no servidor antes de renderizar; o middleware não decide o papel do usuário.

## Autenticação e autorização

Supabase Auth é a fonte da sessão. `profiles.id` corresponde a `auth.users.id`, enquanto o perfil adiciona `role`, `active` e, para CLIENT, `client_id`.

O UX usa usuário e senha. No servidor, `resolveAuthIdentity` localiza o `profiles.login_username`, obtém o `profiles.id` e consulta o usuário Auth por esse UUID; só então chama o Supabase Auth com a identidade técnica real. O e-mail técnico nunca é renderizado, devolvido ao browser ou aceito como campo de login. A associação `profiles.id = auth.users.id` é a fonte de verdade, portanto uma mudança na normalização não altera a identidade de um acesso já criado.

As regras de acesso são:

- ADMIN pode consultar e administrar todos os clientes e dados autorizados.
- CLIENT só pode ler e escrever dados associados ao próprio `client_id`.
- Cliente inativo ou perfil inativo não deve obter acesso funcional.
- RLS está habilitada em todas as tabelas de domínio e não pode ser substituída por filtros no frontend.

## Provisionamento de usuários

Não há trigger automático em `auth.users`, pois metadados de signup não devem decidir papel ou vínculo de cliente. `scripts/create-admin.mjs` e `scripts/create-test-client.mjs` usam `SUPABASE_SERVICE_ROLE_KEY` apenas no terminal para criar primeiro o usuário Auth e depois o profile com valores controlados. A migration concede privilégios SQL explícitos à role `service_role` apenas em `clients` e `profiles`, necessárias a esses scripts; ela continua exclusiva do terminal e não pode ser adicionada ao browser.

O comando `create:admin` é recuperável: se encontrar a identidade Auth técnica já existente e não houver profile, cria o profile ADMIN controlado. Se ambos já estiverem corretos, não cria uma segunda identidade. Um profile existente com papel, vínculo, username ou status divergente não é alterado automaticamente.

## Decisões arquiteturais

- Não criar uma camada de abstração genérica sem caso de uso; serviços e repositórios devem aparecer junto dos fluxos reais.
- Centralizar tipos de domínio e constantes finitas.
- Preferir Server Actions ou Route Handlers para mutações, com checagem de perfil e validação de entrada.
- A gravação de uma origem usa uma Server Action e a função SQL `save_daily_report_source`, para atualizar origem, objeções e cidades em uma única transação sem receber `client_id` do browser.
- Manter dashboard como leitura agregada; não transformar a aplicação em CRM.
- A regra de datas cobráveis fica em `src/lib/reports/date.ts`: ela aplica o primeiro dia do mês de `reporting_started_at` e o corte antes do dia operacional atual. A checagem compartilhada de completude a combina à vigência da origem. Home CLIENT, alerta recorrente e Home ADMIN reutilizam essas regras; o Histórico continua abrindo datas retroativas sem cobri-las como pendência.
- A Home ADMIN busca clientes, reportes e origens/períodos em lote e monta no servidor os clientes com pendência, evitando consultas por cliente.
- Planejar componentes visuais reutilizáveis e responsivos antes de páginas extensas.
- A dashboard ADMIN por cliente possui uma camada própria em `src/lib/analytics`: consultas server-side ficam separadas de agregações, comparações, pendências e metas testáveis como funções puras.

### Identidade de CLIENT

Para CLIENT, um username normalizado é a única identidade legível: ele é o login, `profiles.username` e `clients.slug`. O UUID de `clients` continua sendo a chave primária e todas as FKs seguem usando UUID. A conversão para o e-mail técnico do Supabase Auth ocorre somente no servidor.

O username não é editável na V1. `profiles.login_username` é uma coluna gerada com a regra atual e única; para acessos legados, ela conserva o username armazenado e apenas fornece uma chave de busca canônica. O provisionamento administrativo valida conflitos em `clients`, `profiles` e Auth, cria a identidade Auth e então chama uma função transacional para gravar `clients`, `profiles` e as origens selecionadas. Se essa função falhar, a action remove a identidade Auth recém-criada como compensação.
