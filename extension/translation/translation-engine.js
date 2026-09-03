(function initTranslationEngine(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SiaTranslationEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTranslationModule() {
  "use strict";

  function normalizeLanguage(value, fallback = "") {
    const language = String(value || fallback).trim().toLowerCase().replace(/_/g, "-");
    return language.split("-")[0];
  }

  function create({ translatorApi = globalThis.Translator, maxCacheEntries = 300 } = {}) {
    const translators = new Map();
    const cache = new Map();
    let queue = Promise.resolve();

    async function getTranslator(sourceLanguage, targetLanguage) {
      if (!translatorApi?.availability || !translatorApi?.create) {
        throw new Error("translator-api-unavailable");
      }
      const source = normalizeLanguage(sourceLanguage);
      const target = normalizeLanguage(targetLanguage);
      const key = `${source}:${target}`;
      if (translators.has(key)) return translators.get(key);
      const availability = await translatorApi.availability({ sourceLanguage: source, targetLanguage: target });
      if (availability === "unavailable") throw new Error("language-pair-unavailable");
      const translator = await translatorApi.create({ sourceLanguage: source, targetLanguage: target });
      translators.set(key, translator);
      return translator;
    }

    function remember(key, value) {
      if (cache.has(key)) cache.delete(key);
      cache.set(key, value);
      while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
    }

    async function translate(text, { sourceLanguage = "en", targetLanguage = "pt" } = {}) {
      const originalText = String(text || "").replace(/\s+/g, " ").trim();
      const source = normalizeLanguage(sourceLanguage, "en");
      const target = normalizeLanguage(targetLanguage, "pt");
      if (!originalText || source === target) {
        return { ok: true, translated: false, originalText, text: originalText, sourceLanguage: source, targetLanguage: target };
      }
      const cacheKey = `${source}|${target}|${originalText}`;
      if (cache.has(cacheKey)) return { ...cache.get(cacheKey), cached: true };

      const operation = queue.then(async () => {
        const translator = await getTranslator(source, target);
        const translatedText = String(await translator.translate(originalText)).replace(/\s+/g, " ").trim();
        if (!translatedText) throw new Error("empty-translation");
        const result = { ok: true, translated: true, originalText, text: translatedText, sourceLanguage: source, targetLanguage: target, cached: false };
        remember(cacheKey, result);
        return result;
      });
      queue = operation.catch(() => undefined);
      return operation;
    }

    function dispose() {
      for (const translator of translators.values()) translator?.destroy?.();
      translators.clear();
      cache.clear();
    }

    return Object.freeze({ translate, dispose });
  }

  return Object.freeze({ create, normalizeLanguage });
});
