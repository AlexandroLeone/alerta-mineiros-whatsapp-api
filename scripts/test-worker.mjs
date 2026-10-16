import assert from "node:assert/strict";
import worker from "../worker/index.js";

const authToken = "test-api-token-that-is-not-a-real-secret";
const env = {
  API_AUTH_TOKEN: authToken,
  META_ACCESS_TOKEN: "test-meta-token",
  META_PHONE_NUMBER_ID: "123456789012345",
  META_GRAPH_API_VERSION: "v22.0",
};
const realFetch = globalThis.fetch;
let outbound = null;
let outboundCallCount = 0;
let providerStatus = 200;
let providerBody = { messages: [{ id: "wamid.test" }], contacts: [{ wa_id: "5564999990000" }] };

globalThis.fetch = async (input, init) => {
  outboundCallCount += 1;
  outbound = { url: String(input), init };
  return new Response(JSON.stringify(providerBody), {
    status: providerStatus,
    headers: { "content-type": "application/json" },
  });
};

try {
  const health = await worker.fetch(new Request("https://api.test/health"), env);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: "ok",
    service: "alerta-mineiros-whatsapp-api",
    configured: true,
  });

  const unauthorized = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to: "+5564999990000", message: "Olá" }),
  }), env);
  assert.equal(unauthorized.status, 401);
  assert.equal(outbound, null);

  const invalidPhone = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    body: JSON.stringify({ to: "isso-nao-e-telefone", message: "Olá" }),
  }), env);
  assert.equal(invalidPhone.status, 400);
  assert.equal(outbound, null);

  const groupId = "120363000000@g.us";
  const groupSend = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    body: JSON.stringify({ group_id: groupId, message: "Aviso ao grupo" }),
  }), env);
  assert.equal(groupSend.status, 200);
  assert.deepEqual(await groupSend.json(), {
    ok: true,
    message_id: "wamid.test",
    group_id: groupId,
  });
  assert.deepEqual(JSON.parse(outbound.init.body), {
    messaging_product: "whatsapp",
    recipient_type: "group",
    to: groupId,
    type: "text",
    text: { preview_url: false, body: "Aviso ao grupo" },
  });

  const imageUrl = "https://cdn.example.test/anuncio.jpg";
  const groupImageSend = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    body: JSON.stringify({ group_id: groupId, image_url: imageUrl, caption: "Confira a oferta" }),
  }), env);
  assert.equal(groupImageSend.status, 200);
  assert.deepEqual(await groupImageSend.json(), {
    ok: true,
    message_id: "wamid.test",
    group_id: groupId,
  });
  assert.deepEqual(JSON.parse(outbound.init.body), {
    messaging_product: "whatsapp",
    recipient_type: "group",
    to: groupId,
    type: "image",
    image: { link: imageUrl, caption: "Confira a oferta" },
  });

  const previousOutboundCount = outboundCallCount;
  const insecureImage = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    body: JSON.stringify({ group_id: groupId, image_url: "http://cdn.example.test/anuncio.jpg" }),
  }), env);
  assert.equal(insecureImage.status, 400);
  assert.equal(outboundCallCount, previousOutboundCount);

  const uploadedImageSend = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    body: JSON.stringify({ group_id: groupId, media_id: "987654321", caption: "Imagem carregada" }),
  }), env);
  assert.equal(uploadedImageSend.status, 200);
  assert.deepEqual(JSON.parse(outbound.init.body).image, { id: "987654321", caption: "Imagem carregada" });

  const automaticGroupType = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    body: JSON.stringify({ to: groupId, message: "Outro aviso" }),
  }), env);
  assert.equal(automaticGroupType.status, 200);
  assert.equal(JSON.parse(outbound.init.body).recipient_type, "group");

  const invalidGroupId = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    body: JSON.stringify({ group_id: "grupo inválido", message: "Não enviar" }),
  }), env);
  assert.equal(invalidGroupId.status, 400);

  const success = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    body: JSON.stringify({ to: "+55 (64) 99999-0000", message: "Olá Mineiros" }),
  }), env);
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), {
    ok: true,
    message_id: "wamid.test",
    recipient: "5564999990000",
  });
  assert.equal(outbound.url, "https://graph.facebook.com/v22.0/123456789012345/messages");
  assert.equal(outbound.init.headers.authorization, "Bearer test-meta-token");
  assert.deepEqual(JSON.parse(outbound.init.body), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "5564999990000",
    type: "text",
    text: { preview_url: false, body: "Olá Mineiros" },
  });

  providerStatus = 400;
  providerBody = { error: { message: "Rejected", code: 131000 } };
  const providerError = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    body: JSON.stringify({ to: "+5564999990000", message: "Olá" }),
  }), env);
  assert.equal(providerError.status, 502);
  assert.deepEqual(await providerError.json(), {
    error: "whatsapp_provider_error",
    message: "Rejected",
    provider_code: 131000,
  });

  const unconfigured = await worker.fetch(new Request("https://api.test/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
    body: JSON.stringify({ to: "+5564999990000", message: "Olá" }),
  }), { API_AUTH_TOKEN: authToken });
  assert.equal(unconfigured.status, 503);

  console.log("Worker checks passed: health, authentication, phone, group and image validation, simulated text and group-image sends, provider error, and missing configuration.");
} finally {
  globalThis.fetch = realFetch;
}
