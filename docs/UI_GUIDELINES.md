# Diretrizes de interface

## Princípios

- Interface limpa, profissional, objetiva e orientada a leitura de resultados.
- Mobile-first: a menor tela é a base; melhorias de layout entram progressivamente em breakpoints maiores.
- Clareza é mais importante que densidade. Destaque métricas, status e ação principal da página.
- Não dependa de hover para informações ou ações importantes. Todos os fluxos devem funcionar por toque e teclado.
- Use componentes reutilizáveis em `src/components/ui` e mantenha consistência de cores, bordas, tipografia e estados.

## Breakpoints Tailwind

Use os breakpoints padrão, sem criar variações arbitrárias sem necessidade:

| Prefixo | Largura mínima | Uso típico |
| --- | --- | --- |
| base | 0px | Smartphones / base mobile. |
| `sm` | 640px | Smartphones largos. |
| `md` | 768px | Tablets. |
| `lg` | 1024px | Notebook/tablet landscape; sidebar pode surgir. |
| `xl` | 1280px | Desktop. |
| `2xl` | 1536px | Desktop amplo. |

Valide visualmente, no mínimo, em larguras próximas a 375px, 768px, 1024px e 1440px.

## Layout e navegação

- Nenhuma página deve produzir scroll horizontal indevido.
- Cards devem usar grids de uma coluna no mobile e expandir conforme o espaço disponível.
- A navegação de cliente no desktop poderá usar sidebar com Dashboard, Novo Reporte e Histórico. Em mobile, usar navegação compacta ou inferior, mantendo as ações principais alcançáveis.
- A área administrativa também deve ser responsiva; não trate desktop como único alvo.
- O dashboard deve aproveitar largura no desktop sem compactar textos ou números a ponto de prejudicar leitura no mobile.

## Formulários e tabelas

- O reporte diário é prioritário no smartphone. Organize campos em grupos curtos, com rótulos persistentes e área de toque confortável.
- Em mobile, ações principais podem ocupar toda a largura; em telas maiores, devem respeitar hierarquia e contexto.
- Erros de validação devem aparecer próximos ao campo e explicar como corrigir o valor.
- Tabelas devem ter alternativa por cards/listas quando a leitura horizontal não for adequada. Não force tabela estreita apenas para preservar o mesmo layout.
- Modais devem caber no viewport, ter área rolável interna quando preciso e oferecer fechamento claro.

## Dados e gráficos

- Sempre acompanhe gráficos com rótulos, valores ou resumo textual; cor não pode ser o único meio de comunicação.
- Gráficos Recharts precisam ocupar contêiner responsivo e ter estados de carregamento, vazio e erro quando forem implementados.
- Use cores com contraste adequado e formato localizado para datas, percentuais e valores monetários.

## Acessibilidade

- Use HTML semântico, `label` associado a campos e foco visível.
- Ícones puramente decorativos devem ser ocultos de leitores de tela; botões de ícone precisam de nome acessível.
- Preserve navegação por teclado, ordem lógica de foco e contraste suficiente.
