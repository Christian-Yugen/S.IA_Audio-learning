(() => {
  "use strict";

  const EVENTS = Object.freeze({
    ACCEPTED: "SIA_CAPTION_INPUT_ACCEPTED",
    REJECTED: "SIA_CAPTION_INPUT_REJECTED",
    PLAYER_CHANGED: "SIA_CAPTION_INPUT_PLAYER_CHANGED",
    PAUSED: "SIA_CAPTION_INPUT_PAUSED",
    RESUMED: "SIA_CAPTION_INPUT_RESUMED",
    DESTROYED: "SIA_CAPTION_INPUT_DESTROYED",
  });

  const REASONS = Object.freeze({
    INVALID_CUE: "invalid-cue",
    PLATFORM_NOT_REGISTERED: "platform-not-registered",
    UNSAFE_CUE: "unsafe-cue",
    LOW_CONFIDENCE: "low-confidence",
    INVALID_TIMING: "invalid-timing",
    PLAYER_MISMATCH: "player-mismatch",
    PAUSED: "input-paused",
    DUPLICATE: "duplicate-cue",
    DESTROYED: "input-destroyed",
  });

  const registeredPlatforms = new Set(["udemy"]);
  let activePlayer = null;
  let paused = false;
  let destroyed = false;
  let lastAcceptedKey = "";
  let sequence = 0;
  const listeners = new Set();

  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeIdentity(value) {
    if (!value || typeof value !== "object") return null;
    const videoId = typeof value.videoId === "string" ? value.videoId.trim() : "";
    const containerId = typeof value.containerId === "string" ? value.containerId.trim() : "";
    if (!videoId && !containerId) return null;
    return Object.freeze({ videoId: videoId || null, containerId: containerId || null });
  }

  function sameIdentity(a, b) {
    return Boolean(a && b && a.videoId === b.videoId && a.containerId === b.containerId);
  }

  function normalizeCue(input) {
    if (!input || typeof input !== "object") return null;
    const text = normalizeText(input.text ?? input.captionText);
    const startTime = Number(input.startTime);
    const endTime = Number(input.endTime);
    const playerIdentity = normalizeIdentity(input.playerIdentity);
    return Object.freeze({
      platformId: String(input.platformId || "").trim().toLowerCase(),
      adapterVersion: String(input.adapterVersion || "").trim(),
      text,
      startTime: Number.isFinite(startTime) ? startTime : null,
      endTime: Number.isFinite(endTime) ? endTime : null,
      source: String(input.source || "").trim(),
      sourceConfidence: String(input.sourceConfidence || "").trim().toLowerCase(),
      playerIdentity,
      safeToSpeak: input.safeToSpeak === true,
      sequenceId: input.sequenceId == null ? null : String(input.sequenceId),
    });
  }

  function validTiming(cue) {
    return Number.isFinite(cue?.startTime)
      && Number.isFinite(cue?.endTime)
      && cue.startTime >= 0
      && cue.endTime > cue.startTime;
  }

  function makeKey(cue) {
    return JSON.stringify({
      platformId: cue.platformId,
      text: cue.text,
      startTime: cue.startTime,
      endTime: cue.endTime,
      source: cue.source,
      playerIdentity: cue.playerIdentity,
    });
  }

  function snapshot(value) {
    return value && typeof value === "object" ? Object.freeze({ ...value }) : value;
  }

  function notify(event) {
    const payload = Object.freeze({
      ...event,
      at: Date.now(),
    });
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Um consumidor não pode interromper a validação do próximo evento.
      }
    }
    return payload;
  }

  function rejected(reason, cue = null, extra = {}) {
    return notify({
      type: EVENTS.REJECTED,
      accepted: false,
      reason,
      cue,
      ...extra,
    });
  }

  function validate(cue) {
    if (!cue) return REASONS.INVALID_CUE;
    if (destroyed) return REASONS.DESTROYED;
    if (!registeredPlatforms.has(cue.platformId)) return REASONS.PLATFORM_NOT_REGISTERED;
    if (!cue.text || !cue.adapterVersion || !cue.source || !cue.playerIdentity) return REASONS.INVALID_CUE;
    if (!cue.safeToSpeak) return REASONS.UNSAFE_CUE;
    if (cue.sourceConfidence !== "high") return REASONS.LOW_CONFIDENCE;
    if (!validTiming(cue)) return REASONS.INVALID_TIMING;
    if (!activePlayer || !sameIdentity(activePlayer, cue.playerIdentity)) return REASONS.PLAYER_MISMATCH;
    if (paused) return REASONS.PAUSED;
    return "";
  }

  function push(input) {
    const cue = normalizeCue(input);
    const reason = validate(cue);
    if (reason) return rejected(reason, cue);

    const key = makeKey(cue);
    if (key === lastAcceptedKey) return rejected(REASONS.DUPLICATE, cue);
    lastAcceptedKey = key;
    const accepted = notify({
      type: EVENTS.ACCEPTED,
      accepted: true,
      sequence: ++sequence,
      cue,
    });
    return accepted;
  }

  function registerPlatform(platformId) {
    const id = String(platformId || "").trim().toLowerCase();
    if (id) registeredPlatforms.add(id);
    return id;
  }

  function setActivePlayer(identity) {
    const normalized = normalizeIdentity(identity);
    const changed = !sameIdentity(activePlayer, normalized);
    activePlayer = normalized;
    lastAcceptedKey = "";
    if (changed) {
      notify({
        type: EVENTS.PLAYER_CHANGED,
        accepted: true,
        playerIdentity: snapshot(activePlayer),
      });
    }
    return snapshot(activePlayer);
  }

  function setPaused(value) {
    paused = Boolean(value);
    notify({
      type: paused ? EVENTS.PAUSED : EVENTS.RESUMED,
      accepted: true,
      paused,
    });
    return paused;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getStatus() {
    return Object.freeze({
      destroyed,
      paused,
      activePlayer: snapshot(activePlayer),
      lastAcceptedKey,
      sequence,
      registeredPlatforms: Object.freeze([...registeredPlatforms]),
    });
  }

  function reset() {
    lastAcceptedKey = "";
    sequence = 0;
    return getStatus();
  }

  function destroy() {
    if (destroyed) return getStatus();
    destroyed = true;
    listeners.clear();
    return getStatus();
  }

  globalThis.SiaCaptionInput = Object.freeze({
    EVENTS,
    REASONS,
    normalizeCue,
    registerPlatform,
    setActivePlayer,
    setPaused,
    push,
    subscribe,
    getStatus,
    reset,
    destroy,
  });
})();
