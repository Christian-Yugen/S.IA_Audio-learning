"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { create, normalizeLanguage } = require("../translation/translation-engine.js");

test("normaliza idiomas BCP 47 para o par suportado pelo Chrome", () => {
  assert.equal(normalizeLanguage("en-US"), "en");
  assert.equal(normalizeLanguage("pt_BR"), "pt");
});

test("traduz inglês para português e reutiliza o cache", async () => {
  let calls = 0;
  const engine = create({
    translatorApi: {
      availability: async () => "available",
      create: async () => ({
        translate: async text => { calls += 1; return text === "Hello world." ? "Olá, mundo." : text; }
      })
    }
  });
  const first = await engine.translate("Hello world.", { sourceLanguage: "en-US", targetLanguage: "pt-BR" });
  const second = await engine.translate("Hello world.", { sourceLanguage: "en", targetLanguage: "pt" });
  assert.equal(first.text, "Olá, mundo.");
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
});

test("não chama o tradutor quando origem e destino são equivalentes", async () => {
  const engine = create({ translatorApi: null });
  const result = await engine.translate("Já está em português.", { sourceLanguage: "pt-BR", targetLanguage: "pt" });
  assert.equal(result.translated, false);
  assert.equal(result.text, "Já está em português.");
});

test("informa indisponibilidade sem inventar tradução", async () => {
  const engine = create({ translatorApi: null });
  await assert.rejects(() => engine.translate("Hello.", { sourceLanguage: "en", targetLanguage: "pt" }), /translator-api-unavailable/);
});
