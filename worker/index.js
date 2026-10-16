const SERVICE_NAME = "alerta-mineiros-whatsapp-api";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_LENGTH = 4096;
const MAX_IMAGE_URL_LENGTH = 2048;
const VERSION_PATTERN = /^v\d{1,3}\.\d{1,2}$/;
const GROUP_ID_PATTERN = /^[A-Za-z0-9_.:@-]{1,256}$/;
const MEDIA_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/;
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
  "cache-control": "no-store",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function text(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "content-type": "text/plain; charset=utf-8" },
  });
}

function tokenMatches(candidate, expected) {
  const left = new TextEncoder().encode(candidate);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const phone = value.trim();
  if (!/^\+?[0-9\s().-]{8,24}$/.test(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return digits;
}

function normalizeGroupId(value) {
  if (typeof value !== "string") return null;
  const groupId = value.trim();
  return GROUP_ID_PATTERN.test(groupId) ? groupId : null;
}

function normalizeImageUrl(value) {
  if (typeof value !== "string" || value.trim().length > MAX_IMAGE_URL_LENGTH) return null;
  try {
    const imageUrl = new URL(value.trim());
    const hostname = imageUrl.hostname.toLowerCase();
    if (imageUrl.protocol !== "https:" || !hostname || imageUrl.username || imageUrl.password) return null;
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return null;
    return imageUrl.toString();
  } catch {
    return null;
  }
}

function normalizeMediaId(value) {
  if (typeof value !== "string") return null;
  const mediaId = value.trim();
  return MEDIA_ID_PATTERN.test(mediaId) ? mediaId : null;
}

function documentationPage() {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Alerta Mineiros — API WhatsApp</title>
    <style>
      :root { color-scheme: light; font: 16px/1.55 system-ui, sans-serif; color: #17251e; background: #f4f7f4; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px 18px; }
      main { max-width: 780px; margin: 0 auto; padding: 30px; border: 1px solid #dce7de; border-radius: 18px; background: #fff; box-shadow: 0 16px 40px #163d2212; }
      h1 { margin: 0 0 8px; color: #14783f; font-size: clamp(1.6rem, 5vw, 2.2rem); }
      h2 { margin: 26px 0 8px; font-size: 1.1rem; }
      p { margin: 8px 0; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
      code { color: #126436; }
      pre { overflow-x: auto; padding: 16px; border-radius: 12px; color: #e7f6eb; background: #17251e; font-size: .88rem; }
      .badge { display: inline-block; margin: 10px 0 4px; padding: 4px 10px; border-radius: 999px; color: #126436; background: #e7f5eb; font-size: .82rem; font-weight: 700; }
      .note { padding: 12px 14px; border-left: 4px solid #e0a62a; border-radius: 8px; background: #fff8e8; }
    </style>
  </head>
  <body>
    <main>
      <span class="badge">API REST · WhatsApp Cloud API</span>
      <h1>Alerta Mineiros — API WhatsApp</h1>
      <p>Envie mensagens de texto e imagens para contatos ou grupos compatíveis com a WhatsApp Cloud API.</p>
      <h2>Verificação</h2>
      <p><code>GET /health</code> retorna o estado do serviço, sem expor credenciais.</p>
      <h2>Enviar mensagem</h2>
      <p>Use <code>POST /v1/messages</code> com <code>Authorization: Bearer &lt;API_AUTH_TOKEN&gt;</code> e um corpo JSON:</p>
      <pre>{ "to": "+5564999990000", "message": "Sua mensagem" }</pre>
      <p>O telefone deve incluir o código do país. Para grupos, use <code>group_id</code> com o ID retornado pela Groups API da Meta.</p>
      <pre>{ "group_id": "ID_DO_GRUPO", "message": "Aviso para o grupo" }</pre>
      <p>Para enviar uma imagem, informe uma URL pública HTTPS em <code>image_url</code>. A Meta precisa conseguir abrir a imagem sem login:</p>
      <pre>{ "group_id": "ID_DO_GRUPO", "image_url": "https://site.com/foto.jpg", "caption": "Confira a oferta" }</pre>
      <p>Também é possível usar <code>image: { link, caption }</code> ou um <code>media_id</code> já carregado na Meta. Use imagens JPEG ou PNG.</p>
      <p class="note">O envio a grupos exige que a conta e o grupo estejam habilitados pela Groups API da Meta. Grupos comuns do WhatsApp não são automaticamente compatíveis.</p>
      <p class="note">Mantenha o token da API no backend do seu sistema. Não coloque esse segredo em páginas públicas ou aplicativos no navegador.</p>
    </main>
  </body>
</html>`;
}

async function sendMessage(request, env) {
  if (!env.API_AUTH_TOKEN) {
    return json({ error: "service_not_configured" }, 503);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || !tokenMatches(match[1].trim(), env.API_AUTH_TOKEN)) {
    return json({ error: "unauthorized" }, 401);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ error: "request_too_large" }, 413);
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "invalid_request_body" }, 400);
  }
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return json({ error: "request_too_large" }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json({ error: "invalid_request_body" }, 400);
  }

  const hasGroupId = payload.group_id !== undefined;
  const toLooksLikeGroupId = typeof payload.to === "string" && /@g\.us$/i.test(payload.to.trim());
  const recipientType = payload.recipient_type ?? (hasGroupId || toLooksLikeGroupId ? "group" : "individual");
  if (recipientType !== "individual" && recipientType !== "group") {
    return json({ error: "invalid_recipient_type", allowed: ["individual", "group"] }, 400);
  }
  if (hasGroupId && (recipientType !== "group" || payload.to !== undefined || payload.phone !== undefined)) {
    return json({ error: "invalid_recipient", message: "Use group_id sozinho para enviar a um grupo." }, 400);
  }

  const recipient = recipientType === "group"
    ? normalizeGroupId(payload.group_id ?? payload.to)
    : normalizePhone(payload.to ?? payload.phone);
  if (!recipient) {
    return recipientType === "group"
      ? json({ error: "invalid_group_id", message: "Informe o ID do grupo retornado pela Groups API da Meta." }, 400)
      : json({ error: "invalid_phone", message: "Use um telefone individual com código do país." }, 400);
  }

  const imageInput = payload.image && typeof payload.image === "object" && !Array.isArray(payload.image)
    ? payload.image
    : {};
  const hasImageInput = payload.image_url !== undefined
    || payload.image_id !== undefined
    || payload.media_id !== undefined
    || payload.image !== undefined;
  const messageType = payload.type ?? (hasImageInput ? "image" : "text");
  if (messageType !== "text" && messageType !== "image") {
    return json({ error: "unsupported_message_type", allowed: ["text", "image"] }, 400);
  }

  let providerMessage;
  if (messageType === "text") {
    const message = typeof payload.message === "string" ? payload.message : payload.text;
    if (typeof message !== "string" || !message.trim()) {
      return json({ error: "invalid_message" }, 400);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return json({ error: "message_too_long", max_length: MAX_MESSAGE_LENGTH }, 400);
    }
    if (hasImageInput) return json({ error: "invalid_message_type" }, 400);
    providerMessage = { text: { preview_url: false, body: message } };
  } else {
    const imageLinkInput = payload.image_url ?? (typeof payload.image === "string" ? payload.image : imageInput.link);
    const mediaIdInput = payload.media_id ?? payload.image_id ?? imageInput.id;
    const imageLink = imageLinkInput === undefined ? null : normalizeImageUrl(imageLinkInput);
    const mediaId = mediaIdInput === undefined ? null : normalizeMediaId(mediaIdInput);
    if ((imageLinkInput !== undefined && !imageLink) || (mediaIdInput !== undefined && !mediaId)) {
      return json({ error: "invalid_image_source", message: "Use uma URL pública HTTPS ou um media_id válido da Meta." }, 400);
    }
    if (Boolean(imageLink) === Boolean(mediaId)) {
      return json({ error: "invalid_image_source", message: "Informe somente image_url ou media_id." }, 400);
    }

    const captionInput = payload.caption ?? imageInput.caption ?? payload.message ?? payload.text;
    if (captionInput !== undefined && typeof captionInput !== "string") {
      return json({ error: "invalid_caption" }, 400);
    }
    if (typeof captionInput === "string" && captionInput.length > MAX_MESSAGE_LENGTH) {
      return json({ error: "caption_too_long", max_length: MAX_MESSAGE_LENGTH }, 400);
    }

    const image = imageLink ? { link: imageLink } : { id: mediaId };
    if (typeof captionInput === "string" && captionInput.trim()) image.caption = captionInput;
    providerMessage = { image };
  }

  const accessToken = env.META_ACCESS_TOKEN;
  const phoneNumberId = env.META_PHONE_NUMBER_ID;
  const apiVersion = env.META_GRAPH_API_VERSION;
  if (!accessToken || !phoneNumberId || !apiVersion || !/^\d+$/.test(phoneNumberId) || !VERSION_PATTERN.test(apiVersion)) {
    return json({ error: "service_not_configured" }, 503);
  }

  let providerResponse;
  try {
    providerResponse = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: recipientType,
        to: recipient,
        type: messageType,
        ...providerMessage,
      }),
    });
  } catch {
    return json({ error: "whatsapp_provider_unreachable" }, 502);
  }

  let providerBody;
  try {
    providerBody = await providerResponse.json();
  } catch {
    providerBody = null;
  }

  if (!providerResponse.ok) {
    return json({
      error: "whatsapp_provider_error",
      message: providerBody?.error?.message ?? "O provedor recusou o envio.",
      provider_code: providerBody?.error?.code ?? null,
    }, 502);
  }

  return recipientType === "group"
    ? json({ ok: true, message_id: providerBody?.messages?.[0]?.id ?? null, group_id: recipient })
    : json({
      ok: true,
      message_id: providerBody?.messages?.[0]?.id ?? null,
      recipient: providerBody?.contacts?.[0]?.wa_id ?? recipient,
    });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(documentationPage(), {
        headers: { ...corsHeaders, "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      const configured = Boolean(
        env.API_AUTH_TOKEN && env.META_ACCESS_TOKEN && env.META_PHONE_NUMBER_ID && env.META_GRAPH_API_VERSION,
      );
      return json({ status: "ok", service: SERVICE_NAME, configured });
    }

    if (url.pathname === "/v1/messages") {
      if (request.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405);
      }
      return sendMessage(request, env);
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return text("Method not allowed", 405);
    }
    return json({ error: "not_found" }, 404);
  },
};
