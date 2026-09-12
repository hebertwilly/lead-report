# Lead Report

Aplicação web para acompanhamento diário de leads, vendas e qualidade comercial. A Etapa 3 inclui schema versionado, RLS, autenticação por usuário e senha, dashboard mensal do CLIENT e preenchimento seguro do reporte diário por origem. A área administrativa permanece como tela temporária.

## Tecnologias

- Next.js com App Router e TypeScript
- Tailwind CSS e componentes compatíveis com shadcn/ui
- Supabase (`@supabase/ssr` e `@supabase/supabase-js`), pronto para browser e servidor
- Recharts, reservado para os dashboards posteriores

## Pré-requisitos

- Node.js 20.9 ou superior
- npm 10 ou superior
- Um projeto Supabase

## Como iniciar

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo local de variáveis a partir do exemplo:

   ```bash
   cp .env.example .env.local
   ```

   No Windows PowerShell, use `Copy-Item .env.example .env.local`.

3. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no `.env.local`. A `SUPABASE_SERVICE_ROLE_KEY` é usada exclusivamente no servidor pelos fluxos administrativos e pela resolução segura de login; nunca use prefixo `NEXT_PUBLIC` para ela.

4. Rode o ambiente de desenvolvimento:

   ```bash
   npm run dev
   ```

   Abra [http://localhost:3000](http://localhost:3000). A rota inicial redireciona para `/login`.

## Verificações

```bash
npm run lint
npm run typecheck
npm run build
```

## Banco, autenticação e usuários de desenvolvimento

1. No Supabase Dashboard, desative cadastro público por e-mail/senha. O aplicativo não possui rota de signup e os usuários são criados apenas pelos scripts administrativos.

2. Aplique a migration versionada:

   ```bash
   npx supabase@latest login
   npx supabase@latest link --project-ref SEU_PROJECT_REF
   npx supabase@latest db push
   ```

   A migration está em `supabase/migrations/`. Não há configuração manual de tabelas ou RLS no Dashboard.

3. Para criar o primeiro ADMIN, defina temporariamente no processo os valores de `SUPABASE_SERVICE_ROLE_KEY` e `LEAD_REPORT_BOOTSTRAP_PASSWORD`, depois execute:

   ```bash
   npm run create:admin -- --username agencia-admin
   ```

4. Para criar um CLIENT de teste vinculado a um cliente fictício:

   ```bash
   npm run create:test-client -- --client-name "Cliente Teste" --username cliente-teste
   ```

Os dois scripts criam no Supabase Auth uma identidade interna determinística (`username@auth.internal`) e o profile correspondente. O e-mail técnico não aparece na interface. `create:admin` pode ser executado novamente para reparar um profile ADMIN ausente: ele reutiliza a identidade Auth já existente e não cria outro usuário. Nunca coloque senhas ou a service-role no Git; remova `LEAD_REPORT_BOOTSTRAP_PASSWORD` do ambiente após executar os scripts.

Com o ADMIN criado, faça login em `/login` usando apenas o username e senha definidos no script: o redirecionamento esperado é `/admin`. Com o CLIENT de teste, o destino é `/dashboard`. Usuários não autenticados são enviados a `/login`, e CLIENT não pode acessar `/admin`.

## Estrutura

```text
src/
  app/                 # Rotas e layout global (App Router)
  components/
    auth/              # Componentes de autenticação e sessão
    layout/            # Estruturas de página reutilizáveis
    ui/                # Primitivos no padrão shadcn/ui
  lib/
    supabase/          # Clientes Supabase para browser e servidor
  types/               # Tipos compartilhados de domínio
```

## Escopo atual

O CLIENT pode acessar `/dashboard`, visualizar os indicadores do mês corrente e preencher ou editar, em `/reportes`, as três origens de um reporte diário. A criação e atualização derivam o cliente da sessão autenticada. Não há dashboard administrativo completo, CRM ou integrações externas nesta versão.
