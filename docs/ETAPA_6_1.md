# Etapa 6.1 — cobrança de reportes via WhatsApp

## Campo do cliente

`clients.whatsapp_phone` armazena opcionalmente o WhatsApp do responsável. O valor persistido contém somente dígitos no formato internacional `DDI + DDD + número`, por exemplo `5511999999999`. A migration mantém os clientes existentes com o campo nulo e aplica uma restrição de 10 a 15 dígitos, sem zero inicial.

No cadastro administrativo e em `/admin/clientes/[clientId]?view=settings`, o campo **WhatsApp do responsável** aceita formatação humana. Números brasileiros com 10 ou 11 dígitos, já contendo DDD, recebem o DDI `55`. Entradas sem DDD não são completadas artificialmente. O campo é opcional e somente o ADMIN pode alterá-lo, pelas regras RLS já existentes e pelo guard da Server Action.

## Cobrança

A página administrativa do cliente possui a ação compacta **Solicitar reporte** no cabeçalho. A cobrança é uma ação operacional secundária e não ocupa uma seção própria na dashboard. A consulta usa as mesmas regras operacionais de pendência já compartilhadas pelo sistema: início cobrável, datas anteriores ao dia atual, vigência das origens e completude por origem. Filtros da visão analítica não alteram essa lista.

A mensagem é gerada de forma determinística em `src/lib/whatsapp`:

- com um dia, informa a data específica;
- com vários dias, informa a quantidade e a data mais antiga;
- sem pendências, não gera mensagem e exibe o estado de cliente em dia.

As datas usam `DD/MM/AAAA`. Com telefone cadastrado, **Solicitar reporte** monta `https://wa.me/{PHONE}?text={MENSAGEM_CODIFICADA}` e abre uma nova aba; o ADMIN ainda revisa e envia a mensagem manualmente. Sem telefone, a mesma ação copia a mensagem para colagem manual, inclusive em grupos, e exibe um feedback curto. Sem pendências, a ação é substituída pelo estado discreto **Reportes em dia**.

A quantidade, a pendência mais antiga e a ausência de WhatsApp aparecem apenas como contexto textual discreto junto à ação. Não há card de métricas operacionais, preview da mensagem nem botão para abrir a plataforma; a URL continua incluída no corpo da mensagem.

Links `wa.me` não abrem grupos diretamente. Não existe disparo automático, integração com API do WhatsApp ou armazenamento do envio.

## URL da plataforma

`NEXT_PUBLIC_APP_URL` define a URL pública incluída na mensagem. A configuração é centralizada, reduzida à raiz da origem e aceita somente HTTP ou HTTPS. Quando a variável não está definida, o ambiente local usa `http://localhost:3000`. Antes do deploy, configure o domínio real, por exemplo:

```env
NEXT_PUBLIC_APP_URL=https://app.exemplo.com
```

## Banco real

Depois de revisar e vincular a Supabase CLI ao projeto correto, aplique a migration com:

```bash
npx supabase db push
```
