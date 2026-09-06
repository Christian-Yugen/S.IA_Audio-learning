"use strict";

importScripts("platform-selection.js");

const OFFSCREEN_PATH = "offscreen.html";
const PLATFORM_SELECTIONS_KEY = "sia_platform_selections";
const PLATFORM_TAB_SELECTIONS_KEY = "sia_platform_tab_selections";
let criandoOffscreen = null;

async function garantirOffscreen() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("API offscreen não disponível neste Chrome");
  }
  if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) return;
  if (criandoOffscreen) return criandoOffscreen;

  criandoOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["WORKERS"],
    justification: "Executar o motor Piper PT-BR local em um Worker isolado da página Coursera."
  }).finally(() => {
    criandoOffscreen = null;
  });
  return criandoOffscreen;
}

async function enviarParaHostNeural(message) {
  await garantirOffscreen();
  return chrome.runtime.sendMessage({
    ...message,
    target: "sia-piper-offscreen"
  });
}

async function enviarParaAbaAtiva(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // O comando fica inativo fora de uma aula compatível.
  }
}

const youtubeBootstrap = Object.freeze({
  mainFiles: [
    "platform-adapters/youtube/youtube-caption-parser.js",
    "platform-adapters/youtube/youtube-caption-bridge.js"
  ],
  isolatedFiles: [
    "sync-engine.js",
    "neural-tts/piper-bridge.js",
    "learning/neuro-director.js",
    "learning/learning-engine.js",
    "translation/translation-engine.js",
    "platform-adapters/caption-input.js",
    "content.js",
    "platform-adapters/platform-router.js",
    "platform-adapters/core-event-bridge.js",
    "platform-adapters/core-diagnostic-state.js",
    "platform-adapters/youtube/youtube-host.js"
  ]
});
const youtubeInjectedTabs = new Set();
const youtubeTabSelections = new Map();

async function obterSelecaoDaAba(url, tabId = null) {
  const hostKey = globalThis.SiaPlatformSelection?.hostKeyFromUrl?.(url) || "";
  let tabMode = tabId ? youtubeTabSelections.get(tabId) : "";
  let tabSessionMode = "";
  if (!tabMode && tabId && chrome.storage.session?.get) {
    const tabSessionResult = await chrome.storage.session.get(PLATFORM_TAB_SELECTIONS_KEY);
    tabSessionMode = tabSessionResult?.[PLATFORM_TAB_SELECTIONS_KEY]?.[String(tabId)] || "";
    if (tabSessionMode) youtubeTabSelections.set(tabId, tabSessionMode);
  }
  const localResult = await chrome.storage.local.get(PLATFORM_SELECTIONS_KEY);
  const localMode = localResult?.[PLATFORM_SELECTIONS_KEY]?.[hostKey];
  let sessionMode = "";
  if (chrome.storage.session?.get) {
    const sessionResult = await chrome.storage.session.get(PLATFORM_SELECTIONS_KEY);
    sessionMode = sessionResult?.[PLATFORM_SELECTIONS_KEY]?.[hostKey] || "";
  }
  const source = tabMode || tabSessionMode ? "tab" : (sessionMode || localMode ? "domain" : "default");
  const requested = globalThis.SiaPlatformSelection?.normalizePlatform?.(tabMode || tabSessionMode || sessionMode || localMode || globalThis.SiaPlatformSelection?.defaultModeForUrl?.(url) || "off") || "off";
  const compatible = globalThis.SiaPlatformSelection?.isCompatible?.(url, requested) === true;
  return { requested, compatible, hostKey, source };
}

async function ativarYoutubeNaAba(tabId, url) {
  const selection = await obterSelecaoDaAba(url, tabId);
  if (!selection.compatible || !["youtube", "auto"].includes(selection.requested)) {
    if (youtubeInjectedTabs.has(tabId)) return desativarYoutubeNaAba(tabId);
    return { ok: true, active: false, waitingForSelection: true, platformId: "youtube", selection: selection.requested };
  }
  if (!chrome.scripting?.executeScript || youtubeInjectedTabs.has(tabId)) {
    return { ok: true, alreadyActive: youtubeInjectedTabs.has(tabId), platformId: "youtube" };
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: youtubeBootstrap.mainFiles
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    files: youtubeBootstrap.isolatedFiles
  });
  youtubeInjectedTabs.add(tabId);
  return { ok: true, active: true, platformId: "youtube" };
}

chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
  if (changeInfo?.status === "loading") youtubeInjectedTabs.delete(tabId);
});

chrome.tabs.onRemoved?.addListener(tabId => {
  youtubeInjectedTabs.delete(tabId);
  youtubeTabSelections.delete(tabId);
  if (chrome.storage.session?.get && chrome.storage.session?.set) {
    void chrome.storage.session.get(PLATFORM_TAB_SELECTIONS_KEY).then(result => {
      const selections = { ...(result?.[PLATFORM_TAB_SELECTIONS_KEY] || {}) };
      delete selections[String(tabId)];
      return chrome.storage.session.set({ [PLATFORM_TAB_SELECTIONS_KEY]: selections });
    }).catch(() => {});
  }
});

async function desativarYoutubeNaAba(tabId, { clearTabSelection = true } = {}) {
  if (clearTabSelection) youtubeTabSelections.delete(tabId);
  if (!youtubeInjectedTabs.has(tabId)) return { ok: true, active: false, alreadyInactive: true };
  try {
    await chrome.tabs.sendMessage(tabId, { type: "SIA_PLATFORM_DEACTIVATE", platformId: "youtube" });
  } catch {
    // A aba pode estar recarregando; o novo bootstrap verá a seleção desativada.
  }
  youtubeInjectedTabs.delete(tabId);
  return { ok: true, active: false, platformId: "youtube" };
}

async function aplicarSelecaoYoutube({ tabId, url, mode, scope = "tab" } = {}) {
  const requested = globalThis.SiaPlatformSelection?.normalizePlatform?.(mode) || "off";
  const selection = globalThis.SiaPlatformSelection?.describeSelection?.(url, requested);
  if (!selection?.compatible || !["youtube", "off", "auto"].includes(requested)) {
    return { ok: false, reason: "platform-mismatch", diagnostic: selection || null };
  }
  if (requested === "off") {
    if (scope === "tab") {
      youtubeTabSelections.set(tabId, "off");
      if (chrome.storage.session?.get && chrome.storage.session?.set) {
        const sessionResult = await chrome.storage.session.get(PLATFORM_TAB_SELECTIONS_KEY);
        const selections = { ...(sessionResult?.[PLATFORM_TAB_SELECTIONS_KEY] || {}) };
        selections[String(tabId)] = "off";
        await chrome.storage.session.set({ [PLATFORM_TAB_SELECTIONS_KEY]: selections });
      }
      return desativarYoutubeNaAba(tabId, { clearTabSelection: false });
    }
    youtubeTabSelections.delete(tabId);
    if (chrome.storage.session?.get && chrome.storage.session?.set) {
      const sessionResult = await chrome.storage.session.get(PLATFORM_TAB_SELECTIONS_KEY);
      const tabSelections = { ...(sessionResult?.[PLATFORM_TAB_SELECTIONS_KEY] || {}) };
      delete tabSelections[String(tabId)];
      await chrome.storage.session.set({ [PLATFORM_TAB_SELECTIONS_KEY]: tabSelections });
    }
    const hostKey = globalThis.SiaPlatformSelection?.hostKeyFromUrl?.(url) || "";
    const result = await chrome.storage.local.get(PLATFORM_SELECTIONS_KEY);
    const selections = { ...(result?.[PLATFORM_SELECTIONS_KEY] || {}) };
    delete selections[hostKey];
    await chrome.storage.local.set({ [PLATFORM_SELECTIONS_KEY]: selections });
    return desativarYoutubeNaAba(tabId);
  }
  if (scope === "domain") {
    youtubeTabSelections.delete(tabId);
    if (chrome.storage.session?.get && chrome.storage.session?.set) {
      const sessionResult = await chrome.storage.session.get(PLATFORM_TAB_SELECTIONS_KEY);
      const tabSelections = { ...(sessionResult?.[PLATFORM_TAB_SELECTIONS_KEY] || {}) };
      delete tabSelections[String(tabId)];
      await chrome.storage.session.set({ [PLATFORM_TAB_SELECTIONS_KEY]: tabSelections });
    }
    const hostKey = globalThis.SiaPlatformSelection?.hostKeyFromUrl?.(url) || "";
    const result = await chrome.storage.local.get(PLATFORM_SELECTIONS_KEY);
    const selections = { ...(result?.[PLATFORM_SELECTIONS_KEY] || {}) };
    selections[hostKey] = requested;
    await chrome.storage.local.set({ [PLATFORM_SELECTIONS_KEY]: selections });
  } else {
    youtubeTabSelections.set(tabId, requested);
    if (chrome.storage.session?.get && chrome.storage.session?.set) {
      const sessionResult = await chrome.storage.session.get(PLATFORM_TAB_SELECTIONS_KEY);
      const tabSelections = { ...(sessionResult?.[PLATFORM_TAB_SELECTIONS_KEY] || {}) };
      tabSelections[String(tabId)] = requested;
      await chrome.storage.session.set({ [PLATFORM_TAB_SELECTIONS_KEY]: tabSelections });
    }
  }
  return ativarYoutubeNaAba(tabId, url);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "sia-platform-selection-get") {
    const tabId = Number(message.tabId);
    const url = typeof message.url === "string" ? message.url : "";
    void obterSelecaoDaAba(url, Number.isInteger(tabId) ? tabId : null)
      .then(selection => sendResponse({ ok: true, ...selection }))
      .catch(error => sendResponse({ ok: false, reason: "platform-selection-read-failed", message: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "SIA_SPEECH_STATE" || message?.type === "SIA_SPEECH_CADENCE") {
    chrome.runtime.sendMessage(message).catch(() => {});
    return;
  }
  if (message?.target === "sia-platform-selection-apply") {
    const tabId = Number(message.tabId);
    if (!Number.isInteger(tabId) || tabId < 0 || typeof message.url !== "string") {
      sendResponse({ ok: false, reason: "invalid-platform-selection" });
      return false;
    }
    void aplicarSelecaoYoutube({
      tabId,
      url: message.url,
      mode: message.mode,
      scope: message.scope === "domain" ? "domain" : "tab"
    }).then(sendResponse).catch(error => {
      sendResponse({ ok: false, reason: "platform-selection-failed", message: error?.message || String(error) });
    });
    return true;
  }
  if (message?.target === "sia-platform-bootstrap-request") {
    const tabId = sender?.tab?.id;
    if (!tabId || message.platformId !== "youtube" || typeof message.url !== "string") {
      sendResponse({ ok: false, reason: "invalid-platform-bootstrap" });
      return false;
    }
    void ativarYoutubeNaAba(tabId, message.url).then(sendResponse).catch(error => {
      sendResponse({ ok: false, reason: "youtube-bootstrap-failed", message: error?.message || String(error) });
    });
    return true;
  }
  if (message?.target !== "sia-piper-router") return;
  void enviarParaHostNeural(message).then(sendResponse).catch(error => {
    sendResponse({
      ok: false,
      type: "sia-piper-error",
      requestId: message.requestId ?? null,
      message: error?.message || String(error)
    });
  });
  return true;
});

chrome.commands.onCommand.addListener(command => {
  if (command === "replay-last-sentence") {
    void enviarParaAbaAtiva({ type: "SIA_REPLAY_LAST" });
  }
});
