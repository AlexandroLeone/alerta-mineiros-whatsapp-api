# Alerta Mineiros — API WhatsApp

Worker independente de Node.js para enviar mensagens de texto ou imagens a contatos e grupos compatíveis pela WhatsApp Cloud API.

## Endpoints

- `GET /health` — verifica o serviço e informa se as variáveis de configuração estão presentes.
- `POST /v1/messages` — envia texto ou imagem a um contato ou grupo compatível.
- `OPTIONS` — atende às requisições de preflight CORS.

### Envio

Envie `Authorization: Bearer <API_AUTH_TOKEN>` e um JSON como:

```json
{
  "to": "+5564999990000",
  "message": "Sua mensagem"
}
```

O telefone deve conter o código do país. `phone` pode ser usado no lugar de `to`, e `text` no lugar de `message`.

Para enviar a um grupo habilitado pela Groups API da Meta, use o `group_id` retornado por essa API:

```json
{
  "group_id": "ID_DO_GRUPO",
  "message": "Aviso para o grupo"
}
```

Também é possível enviar com `{ "recipient_type": "group", "to": "ID_DO_GRUPO", "message": "..." }`. IDs no formato tradicional terminado em `@g.us` também são reconhecidos em `to`. A Meta só aceita o envio quando a conta e o grupo estão habilitados para a Groups API; um grupo comum do WhatsApp não passa a ser compatível apenas por informar seu ID. Envios individuais continuam usando `to` ou `phone` com o número em formato internacional.

### Imagem

Envie uma imagem usando uma URL pública HTTPS que os servidores da Meta consigam acessar sem login. Use JPEG ou PNG. A API aceita `image_url` ou o objeto `image` no formato da Cloud API:

```json
{
  "group_id": "ID_DO_GRUPO",
  "image_url": "https://seu-site.com/anuncio.jpg",
  "caption": "Confira esta oferta"
}
```

Também pode enviar uma imagem que já foi carregada na Meta informando `media_id` (ou `image_id`). A imagem pode ser enviada sem legenda. O endpoint encaminha o endereço à Meta; ele não recebe arquivos locais ou URLs privadas.

## Configuração no Site

Configure estas variáveis no ambiente de produção. Marque os três tokens/IDs sensíveis como secrets:

- `API_AUTH_TOKEN` — segredo forte para autenticar chamadas a esta API.
- `META_ACCESS_TOKEN` — token de acesso da WhatsApp Cloud API.
- `META_PHONE_NUMBER_ID` — ID numérico do telefone habilitado na Meta.
- `META_GRAPH_API_VERSION` — versão da Graph API no formato `vNN.N`, conforme a versão habilitada no seu app da Meta.

Não coloque `API_AUTH_TOKEN` nem `META_ACCESS_TOKEN` em código de navegador. O cliente que envia mensagens deve chamar este Worker a partir do seu backend.

## Verificação local

```text
node scripts/test-worker.mjs
bash scripts/build.sh
node scripts/validate-artifact.mjs
```
