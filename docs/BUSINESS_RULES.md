# Regras de negócio

## Reporte diário

Ao abrir `/reportes` sem o parâmetro `data`, a data selecionada por padrão é sempre o dia calendário anterior no fuso operacional. Uma `data` válida informada na URL continua tendo precedência.

Cada reporte pertence a um cliente e uma data. Não pode haver mais de um reporte para o mesmo cliente na mesma data e não é permitido informar data futura. A data deve ser avaliada no fuso operacional definido para o produto (atualmente, America/Sao_Paulo).

O reporte pode ser preenchido por origem. As origens são configuradas pelo ADMIN para cada cliente; recomenda-se manter as aplicáveis atualizadas, com prioridade para a origem principal. Uma origem registrada sem movimento é preenchida com valores zero.

Uma mesma origem configurada só pode existir uma vez dentro de um reporte. A completude operacional de uma data considera as origens ativas na data, respeitando seus períodos de vigência; origens desativadas preservam os registros e a leitura histórica anterior.

## Identidade e cadastro de cliente

O username do CLIENT é normalizado para minúsculas, sem acentos, com espaços convertidos em hífen e somente letras `a-z`, números e hífen. Ele é único no sistema e é usado simultaneamente como login, `profiles.username` e `clients.slug`; o UUID do cliente continua técnico. O username não pode ser alterado na V1, mas o nome comercial pode.

O ADMIN configura as origens já no cadastro. Deve haver ao menos uma origem ativa, os nomes não podem se repetir e pode haver no máximo uma origem principal ativa. Vendas e faturamento exibidos na lista administrativa são somente o total do mês atual; comparações e análises aprofundadas pertencem à Etapa 6.

## Cobrança de pendências

Cada cliente possui `reporting_started_at`, a data em que passou a ser acompanhado pelo Lead Report. A primeira data possível de cobrança é sempre o primeiro dia do mês dessa data. Por exemplo, para início em 09/09/2026, o período cobrado começa em 01/09/2026; agosto e meses anteriores não geram alertas, badges, contagens ou pendências.

No mês atual, apenas datas anteriores ao dia em curso são pendências operacionais. Datas futuras nunca são cobradas. A data só é pendente quando houver origem vigente nela; `lead_source_active_periods` impede que uma origem adicionada ou reativada posteriormente gere cobrança retroativa.

O CLIENT e o ADMIN continuam podendo abrir e preencher datas anteriores ao início de acompanhamento. Esse preenchimento é retroativo voluntário e não muda o período cobrado.

## Métricas por origem

Para cada origem são informados `leads_received`, `leads_answered`, `leads_interested`, `sales`, `revenue` e `notes`.

- **Lead recebido:** contato recebido pelo cliente naquela origem e data.
- **Lead respondido:** lead que recebeu atendimento/resposta comercial.
- **Lead interessado:** pessoa que demonstrou intenção real de compra, por exemplo perguntando preço, disponibilidade, tamanho, frete, condições de pagamento ou avançando na escolha do produto.
- **Venda:** venda realizada a partir daquela origem.
- **Faturamento:** valor total das vendas atribuídas à origem no reporte. Não pode ser negativo.
- **Observações:** texto livre opcional por origem.

Validações obrigatórias por origem:

```text
0 <= leads_answered <= leads_received
0 <= leads_interested <= leads_answered
0 <= sales <= leads_interested
revenue >= 0
```

Todos os contadores são inteiros não negativos. Na V1, `revenue` é sempre armazenado em BRL como `numeric(12,2)`; não existe coluna de moeda.

## Objeções / motivos de não conversão

Cada origem aceita quantidades para os seguintes motivos:

| Código | Rótulo |
| --- | --- |
| `NO_RESPONSE` | Sem resposta |
| `PRICE` | Preço |
| `SHIPPING` | Frete |
| `PRODUCT_UNAVAILABLE` | Produto indisponível |
| `PAYMENT_METHOD` | Forma de pagamento |
| `THINKING` | Está pensando |
| `NO_INTEREST` | Sem interesse |
| `OTHER` | Outro |

As objeções são informadas por quantidade inteira não negativa. Um mesmo lead pode ter mais de uma objeção; portanto a soma das objeções não precisa ser igual aos leads que não compraram, nem deve ser usada como validação de equivalência.

## Vendas para outras cidades

Para cada origem podem ser adicionados registros de envio com `city`, `state` e `quantity`.

- `city` é obrigatório e representa a cidade de destino.
- `state` é obrigatório e representa a UF de destino.
- `quantity` é inteiro positivo.
- A soma de `quantity` de todos os envios de uma origem é calculada automaticamente.
- Essa soma não pode ser maior que `sales` da mesma origem. Na V1, a validação da soma será feita na camada de aplicação, em transação; não há trigger de agregação no banco.

Exemplo: Ribeirão Preto/SP, quantidade 2; Uberlândia/MG, quantidade 1.

## Agregações para dashboard

Em um período, some métricas de todas as origens e reportes incluídos. Quando o denominador for zero, a taxa deve ser apresentada como zero ou estado sem dados — nunca como `NaN` ou infinito.

| Indicador | Fórmula |
| --- | --- |
| Taxa de atendimento | `leads_answered / leads_received` |
| Taxa de interesse | `leads_interested / leads_answered` |
| Taxa de conversão | `sales / leads_received` |
| Conversão dos interessados | `sales / leads_interested` |
| Ticket médio | `revenue / sales` |

As fórmulas não mudam por origem; o dashboard pode agregá-las por período e apresentar também o recorte individual de cada origem.
