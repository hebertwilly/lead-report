# Instruções para agentes — Lead Report

## Fonte de verdade e escopo

Este arquivo contém instruções permanentes para qualquer agente que atuar no repositório. Leia também `docs/` antes de implementar uma etapa. Em caso de conflito, siga esta ordem: solicitação atual do usuário, este arquivo, documentos em `docs/`, código existente.

O Lead Report é uma aplicação web para uma agência acompanhar reportes diários de leads, resultados comerciais e qualidade dos contatos de seus clientes. Não é um CRM. Evite adicionar pipeline, contatos individuais, automações de vendas ou funcionalidades não explicitamente solicitadas.

Implemente exclusivamente a etapa solicitada. Não antecipe banco, migrations, RLS, autenticação, dashboards, formulários ou regras de negócio quando o pedido não os incluir. Antes de editar, inspecione o estado do repositório e preserve alterações existentes que não pertençam à tarefa.

## Stack e organização

- Next.js com App Router, TypeScript estrito e Tailwind CSS.
- Componentes no padrão shadcn/ui em `src/components/ui`; reutilize-os antes de criar novos primitivos.
- Supabase, PostgreSQL, Supabase Auth e `@supabase/ssr` para dados e autenticação futuros.
- Recharts para gráficos futuros.
- Rotas e layouts ficam em `src/app`; UI de domínio em `src/components`; acesso a serviços e utilitários em `src/lib`; tipos compartilhados em `src/types`.
- Prefira Server Components. Adicione `"use client"` apenas quando houver interação de navegador, estado, efeitos, APIs do browser ou biblioteca que o exija.
- Mantenha arquivos pequenos, coesos e tipados. Separe regras de negócio, acesso a dados e apresentação.

## Segurança e autorização

- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` ou qualquer segredo em variáveis `NEXT_PUBLIC_*`, componentes de cliente, logs ou documentação de exemplo.
- Use somente URL pública e chave anon/publishable em `NEXT_PUBLIC_SUPABASE_*`.
- O ADMIN acessa todos os clientes; CLIENT acessa exclusivamente dados do seu `client_id`.
- O acesso CLIENT é criado e administrado apenas pelo ADMIN. Não implemente auto cadastro, alteração de usuário, alteração de senha nem configurações de conta para CLIENT.
- Login usa username + senha; a identidade técnica do Supabase Auth é resolvida exclusivamente no servidor. Não exponha nem aceite o e-mail técnico na UI.
- Qualquer autorização deve ser aplicada também no banco via RLS; checagens de interface não são proteção suficiente.
- Não implemente políticas ou schema sem a etapa correspondente ter sido solicitada.

## Convenções

- Escreva interface, mensagens e documentação de produto em português do Brasil.
- Use aliases `@/*`, nomes de componentes em PascalCase e arquivos/kebab-case quando houver mais de uma palavra.
- Modele valores finitos com uniões/enums claros; não use strings soltas para papéis, origens ou objeções.
- Não use `any`, não silencie erros de tipos e não adicione dependências sem necessidade funcional.
- Atualize documentação relevante quando uma decisão de produto, regra ou arquitetura mudar.

## Responsividade e acessibilidade

- Mobile-first é obrigatório. A área de cliente e a administrativa devem funcionar em 375px, 768px, 1024px e 1440px.
- Não introduza scroll horizontal indevido. Formulários devem ter toque confortável; ações importantes não podem depender de hover.
- Reorganize cards e grids por largura. Tabelas que não forem utilizáveis em mobile devem ter alternativa em cards/listas.
- Gráficos, modais e navegação devem ser utilizáveis em telas pequenas. Consulte `docs/UI_GUIDELINES.md` para detalhes.

## Validação

Após alterações de código, execute e corrija erros destes comandos:

```bash
npm run lint
npm run typecheck
```

Quando a tarefa alterar compilação, dependências, rotas, CSS ou configuração, verifique também:

```bash
npm run dev
```

Confirme a rota afetada localmente e informe claramente qualquer verificação visual que não tenha sido possível executar. Não edite `node_modules`, `.next` ou arquivos gerados.
