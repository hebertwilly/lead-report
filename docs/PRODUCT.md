# Produto — Lead Report

## Visão

Lead Report permite que uma agência acompanhe diariamente os leads recebidos por cada cliente, o tratamento comercial dado a esses contatos, as vendas realizadas e os principais obstáculos de conversão. O sistema reúne reporte operacional diário e leitura gerencial mensal, sem substituir um CRM.

## Usuários

### ADMIN

Usuário interno da agência. Pode cadastrar e administrar clientes, criar e resetar seus acessos, ativar ou desativar clientes, consultar todos os reportes e dashboards e verificar quem preencheu o reporte diário.

### CLIENT

Usuário vinculado a um único cliente. O acesso é criado somente pelo ADMIN. Pode ver somente os dados do próprio cliente, preencher reportes, consultar histórico e editar reportes permitidos. Não pode criar conta, alterar usuário, alterar senha nem acessar configurações de conta.

## V1 planejada

### Área do cliente

1. Login.
2. Home operacional mensal, com status e atalho para o reporte de hoje, resumo do mês, progresso de preenchimento e datas pendentes.
3. Novo reporte diário.
4. Histórico de reportes.
5. Edição de reporte existente.
6. Logout.

### Área administrativa

1. Dashboard administrativo.
2. Lista, criação e visualização de clientes.
3. Criação e reset de acesso de cliente.
4. Ativação e desativação de cliente.
5. Consulta a reportes e dashboard de cada cliente.
6. Status diário de preenchimento.

## Métricas esperadas no dashboard do cliente

O período inicial é o mês atual. A Home CLIENT exibe: total de leads, respondidos, interessados, vendas, faturamento, taxa de conversão e ticket médio, além do status do reporte de hoje, progresso de preenchimento e datas pendentes. O detalhamento por origem permanece em `/reportes`; análises detalhadas de funil, origens, objeções e cidades ficarão no painel ADMIN.

No primeiro acesso, o CLIENT recebe um tour guiado pela interface e sua conclusão é persistida no perfil. Nos acessos seguintes, se o reporte do dia anterior estiver incompleto, a Home exibe um alerta recorrente daquela data. Fechar o alerta vale apenas para a navegação atual; não há dispensa persistida.

As definições e fórmulas pertencem a `BUSINESS_RULES.md`.

## Fora de escopo

- CRM, cadastro ou gestão individual de leads.
- Funil de oportunidades individual, tarefas, chat ou automações comerciais.
- Auto cadastro de clientes.
- Configurações de conta por usuários CLIENT.

## Estado atual do repositório

O schema, RLS, login, logout, sessão e rotas protegidas foram implementados. A Etapa 3 também entrega a Home operacional do CLIENT, o preenchimento/edição por origem em `/reportes`, o resumo comercial do mês atual, o progresso de preenchimento e as pendências do mês até a data atual. A Etapa 4 adiciona o Histórico do CLIENT em `/historico`, com filtro mensal, status por data e origem e atalho para abrir o reporte selecionado. A Etapa 5 entrega o painel operacional ADMIN, a gestão de clientes e acessos e as origens configuráveis por cliente. A Etapa 6 transforma o detalhe ADMIN de cada cliente em uma dashboard analítica com períodos, comparações, metas, funil e diagnósticos determinísticos.

### Home ADMIN operacional

A Home ADMIN mostra somente o resumo de clientes ativos, inativos e com reportes pendentes, seguido pelos clientes que exigem atenção. A administração e a listagem geral de clientes permanecem em `/admin/clientes`.

### Gestão ADMIN de clientes

Em `/admin/clientes`, o ADMIN busca por nome ou username, filtra clientes ativos ou inativos e vê um resumo operacional por cliente: pendências, último reporte, vendas e faturamento do mês atual. Essa leitura é rápida e não substitui as análises detalhadas da Etapa 6.

O cadastro já recebe as origens de leads que o cliente usará. Ele inicia com Tráfego Pago, Orgânico e Instagram / Links, mas o ADMIN pode ajustar, remover ou acrescentar origens antes de confirmar o cadastro.
