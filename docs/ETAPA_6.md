# Etapa 6 — Dashboard analítica do ADMIN

## Escopo e acesso

A visão analítica fica em `/admin/clientes/[clientId]` e é a área principal do detalhe. A aba **Configurações** conserva identificação, acesso, origens e metas. O carregamento passa pelo guard ADMIN e todas as consultas continuam protegidas pela RLS existente.

## Períodos e comparação

O período operacional usa datas civis no fuso `America/Sao_Paulo`, nunca aceita datas futuras nem `from > to` e permanece na URL por `from` e `to`. A comparação aceita:

- período anterior equivalente: intervalo imediatamente anterior, com o mesmo número inclusivo de dias;
- mês anterior: desloca as datas em um mês e limita o dia ao último dia existente no mês de destino;
- intervalo personalizado válido;
- nenhuma comparação.

Métricas absolutas usam variação percentual. Taxas usam pontos percentuais. Quando a base absoluta comparada é zero, a interface mostra **Novo resultado** em vez de infinito.

## Dados reportados e pendências

Somente origens com status `FILLED` ou `NO_CONTACTS` entram nas agregações. `NO_CONTACTS` representa zero real; `PENDING` e ausência de linha não são convertidos em zero. A pendência continua respeitando o início cobrável do cliente e a vigência das origens. Com filtro por origem, a completude é avaliada para a origem selecionada.

Valores de faturamento são convertidos do `numeric` do PostgreSQL para centavos antes das somas. As consultas são escopadas por `client_id`, limitadas aos períodos necessários e carregam reportes, origens, objeções e cidades em lote.

## Metas mensais

O acompanhamento aparece quando todo o período selecionado pertence ao mês operacional atual. O realizado considera o mês atual até hoje. Quando uma origem está filtrada, o realizado também fica filtrado e a interface avisa que a meta cadastrada continua sendo geral do cliente.

Para `REVENUE`, `SALES` e `LEADS`:

```text
projeção pelo ritmo atual = realizado / dias transcorridos × dias do mês
necessário por dia = (meta - realizado) / dias restantes
```

A projeção é uma extrapolação linear simples, não uma previsão probabilística. Para `AVERAGE_TICKET`, não há projeção cumulativa: são mostrados ticket atual, ticket-meta, diferença e percentual atingido.

### Status determinístico

Para metas cumulativas, compara-se o percentual atingido com o percentual de dias transcorridos no mês, usando tolerância absoluta de 5 pontos percentuais:

- `Meta atingida`: realizado igual ou superior à meta;
- `Acima do ritmo necessário`: atingimento mais de 5 p.p. acima do mês transcorrido;
- `Dentro do ritmo`: diferença de até 5 p.p. para mais ou para menos;
- `Abaixo do ritmo`: atingimento mais de 5 p.p. abaixo do mês transcorrido.

No ticket médio, `Meta atingida` significa ticket atual igual ou superior ao ticket-meta; `Próximo da meta` cobre até 5% abaixo dela; valores menores ficam `Abaixo da meta`.

## Seções analíticas

A dashboard entrega métricas principais, resumo executivo determinístico, acompanhamento de metas, funil, gráfico temporal único com seletor, desempenho por origem configurável, objeções, cidades/envios e resultados diários. Tabelas têm alternativa em cards no mobile. O resumo executivo usa no máximo seis regras relevantes e não atribui causalidade ou garantia aos resultados.
