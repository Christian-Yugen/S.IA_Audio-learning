(() => {
  "use strict";

  const ROUTER_EVENT = "SIA_PLATFORM_EVENT";
  const CORE_EVENT = "SIA_CORE_EVENT";
  const SAFE_CUE_EVENT = "SIA_CAPTION_CHANGED";
  const OBSERVATION_EVENTS = new Set([
    "SIA_PLATFORM_DETECTED",
    "SIA_PLAYER_FOUND",
    "SIA_CAPTION_SOURCE_READY",
    "SIA_ADAPTER_FALLBACK",
    "SIA_ADAPTER_ERROR",
    "SIA_PLATFORM_LEFT",
  ]);

  function createEvent(windowRef, type, detail) {
    if (typeof windowRef?.CustomEvent !== "function") return null;
    return new windowRef.CustomEvent(type, { detail });
  }

  function isSafeCueEvent(detail) {
    const cue = detail?.cue;
    return detail?.type === SAFE_CUE_EVENT
      && cue?.safeToSpeak === true
      && cue?.sourceConfidence === "high"
      && Number.isFinite(Number(cue.startTime))
      && Number.isFinite(Number(cue.endTime))
      && Number(cue.endTime) > Number(cue.startTime);
  }

  function forward(detail, windowRef = globalThis.window) {
    if (!detail || typeof windowRef?.dispatchEvent !== "function") return false;

    if (OBSERVATION_EVENTS.has(detail.type)) {
      const event = createEvent(windowRef, CORE_EVENT, {
        kind: "observation",
        ...detail,
      });
      if (event) windowRef.dispatchEvent(event);
      return true;
    }

    if (isSafeCueEvent(detail)) {
      const event = createEvent(windowRef, CORE_EVENT, {
        kind: "safe-cue",
        ...detail,
      });
      if (event) windowRef.dispatchEvent(event);
      return true;
    }

    // Uma CAPTION_CHANGED insegura permanece diagnosticável, mas não é enviada
    // ao consumidor que poderá acionar áudio. O adaptador continua em modo seguro.
    if (detail.type === SAFE_CUE_EVENT) {
      const event = createEvent(windowRef, CORE_EVENT, {
        kind: "unsafe-cue-blocked",
        platformId: detail.platformId || detail.cue?.platformId || null,
        adapterVersion: detail.adapterVersion || detail.cue?.adapterVersion || null,
        source: detail.cue?.source || null,
        sourceConfidence: detail.cue?.sourceConfidence || null,
        safeToSpeak: false,
        state: detail.state || "UNSAFE_TO_SPEAK",
      });
      if (event) windowRef.dispatchEvent(event);
      return false;
    }

    return false;
  }

  function install(windowRef = globalThis.window) {
    if (typeof windowRef?.addEventListener !== "function") return () => {};
    const listener = event => forward(event?.detail, windowRef);
    windowRef.addEventListener(ROUTER_EVENT, listener);
    return () => windowRef.removeEventListener(ROUTER_EVENT, listener);
  }

  globalThis.SiaCoreEventBridge = Object.freeze({
    ROUTER_EVENT,
    CORE_EVENT,
    SAFE_CUE_EVENT,
    install,
    forward,
    isSafeCueEvent,
  });
})();
