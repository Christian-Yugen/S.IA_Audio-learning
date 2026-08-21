(() => {
  "use strict";

  const EVENT_NAME = "SIA_CORE_EVENT";
  const UPDATED_EVENT = "SIA_DIAGNOSTIC_UPDATED";
  const INITIAL = Object.freeze({
    platformId: null,
    adapterVersion: null,
    player: "missing",
    playerIdentity: null,
    source: "none",
    confidence: "unknown",
    state: "IDLE",
    safeToSpeak: false,
    reason: "not-started",
    lastEventType: null,
    updatedAt: 0,
  });

  let state = { ...INITIAL };

  function copy(value) {
    return value && typeof value === "object" ? { ...value } : value;
  }

  function updateFromEvent(detail) {
    if (!detail || typeof detail !== "object") return get();
    const cue = detail.cue || {};
    const diagnostic = detail.diagnostic || {};
    const next = {
      ...state,
      platformId: detail.platformId || cue.platformId || diagnostic.platformId || state.platformId,
      adapterVersion: detail.adapterVersion || cue.adapterVersion || diagnostic.adapterVersion || state.adapterVersion,
      player: diagnostic.player || detail.player || state.player,
      playerIdentity: copy(detail.playerIdentity || diagnostic.playerIdentity || cue.playerIdentity || state.playerIdentity),
      source: detail.source || cue.source || diagnostic.source || state.source,
      confidence: detail.confidence || cue.sourceConfidence || diagnostic.confidence || state.confidence,
      state: detail.state || diagnostic.state || state.state,
      safeToSpeak: detail.safeToSpeak ?? cue.safeToSpeak ?? diagnostic.safeToSpeak ?? state.safeToSpeak,
      reason: detail.reason || diagnostic.reason || state.reason,
      lastEventType: detail.type || state.lastEventType,
      updatedAt: Date.now(),
    };

    if (detail.kind === "unsafe-cue-blocked" || next.state === "UNSAFE_TO_SPEAK") {
      next.state = "UNSAFE_TO_SPEAK";
      next.safeToSpeak = false;
    }
    state = next;
    return get();
  }

  function get() {
    return Object.freeze({ ...state, playerIdentity: copy(state.playerIdentity) });
  }

  function reset() {
    state = { ...INITIAL };
    return get();
  }

  function install(windowRef = globalThis.window) {
    if (typeof windowRef?.addEventListener !== "function") return () => {};
    const listener = event => {
      const detail = event?.detail;
      const diagnostic = updateFromEvent(detail);
      if (typeof windowRef.dispatchEvent === "function" && typeof windowRef.CustomEvent === "function") {
        windowRef.dispatchEvent(new windowRef.CustomEvent(UPDATED_EVENT, { detail: diagnostic }));
      }
    };
    windowRef.addEventListener(EVENT_NAME, listener);
    return () => windowRef.removeEventListener(EVENT_NAME, listener);
  }

  globalThis.SiaCoreDiagnostic = Object.freeze({
    EVENT_NAME,
    UPDATED_EVENT,
    install,
    get,
    reset,
    updateFromEvent,
  });
})();
