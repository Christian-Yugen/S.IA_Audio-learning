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
    const translatorPromises = new Map();
    const cache = new Map();
    const pending = new Map();
    let state = translatorApi?.availability && translatorApi?.create ? "idle" : "unavailable";
    let lastError = "";

    async function getTranslator(sourceLanguage, targetLanguage) {
      if (!translatorApi?.availability || !translatorApi?.create) {
        throw new Error("translator-api-unavailable");
      }
      const source = normalizeLanguage(sourceLanguage);
      const target = normalizeLanguage(targetLanguage);
      const key = `${source}:${target}`;
      if (translators.has(key)) return translators.get(key);
      if (translatorPromises.has(key)) return translatorPromises.get(key);
      const creation = (async () => {
        state = "checking";
        const availability = await translatorApi.availability({ sourceLanguage: source, targetLanguage: target });
        if (availability === "unavailable") throw new Error("language-pair-unavailable");
        state = availability === "downloadable" ? "downloading" : "loading";
        const translator = await translatorApi.create({ sourceLanguage: source, targetLanguage: target });
        translators.set(key, translator);
        state = "ready";
        lastError = "";
        return translator;
      })();
      translatorPromises.set(key, creation);
      return creation.finally(() => translatorPromises.delete(key));
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
      if (pending.has(cacheKey)) return pending.get(cacheKey);

      const operation = (async () => {
        const translator = await getTranslator(source, target);
        const translatedText = String(await translator.translate(originalText)).replace(/\s+/g, " ").trim();
        if (!translatedText) throw new Error("empty-translation");
        const result = { ok: true, translated: true, originalText, text: translatedText, sourceLanguage: source, targetLanguage: target, cached: false };
        remember(cacheKey, result);
        return result;
      })();
      pending.set(cacheKey, operation);
      return operation.catch(error => {
        state = "error";
        lastError = String(error?.message || error);
        throw error;
      }).finally(() => {
        pending.delete(cacheKey);
      });
    }

    async function prepare({ sourceLanguage = "en", targetLanguage = "pt" } = {}) {
      try {
        await getTranslator(sourceLanguage, targetLanguage);
      } catch (error) {
        state = "error";
        lastError = String(error?.message || error);
      }
      return getStatus();
    }

    function prime(text, options) {
      void translate(text, options).catch(() => {});
    }

    function getStatus() {
      return Object.freeze({ state, ready: state === "ready", error: lastError });
    }

    function dispose() {
      for (const translator of translators.values()) translator?.destroy?.();
      translators.clear();
      cache.clear();
    }

    return Object.freeze({ translate, prepare, prime, getStatus, dispose });
  }

  return Object.freeze({ create, normalizeLanguage });
});
