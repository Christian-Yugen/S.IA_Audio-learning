(() => {
  "use strict";

  const ADAPTER_ID = "udemy";
  const ADAPTER_MODULE = "platform-adapters/udemy/udemy-adapter.js";
  const SHAKA_CUE_EVENT = "SIA_SHAKA_CAPTION_CUE";
  let stopBridge = () => {};
  let stopDiagnostic = () => {};
  let cleanupVideoInput = () => {};
  let cleanupShakaCue = () => {};
  let booted = false;

  function isUdemyLecture(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:"
        && parsed.hostname === "www.udemy.com"
        && /^\/course\/[^/]+\/learn\/lecture\/[^/]+/.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function attachVideoInput(video, onResume = () => {}) {
    cleanupVideoInput();
    const input = globalThis.SiaCaptionInput;
    if (!input || !video?.addEventListener) return;
    input.setPaused(Boolean(video.paused || video.ended));
    const onPause = () => input.setPaused(true);
    const onPlay = () => {
      input.setPaused(false);
      onResume();
    };
    video.addEventListener("pause", onPause, { passive: true });
    video.addEventListener("play", onPlay, { passive: true });
    cleanupVideoInput = () => {
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      cleanupVideoInput = () => {};
    };
  }

  function installShakaCueBridge(input, emit) {
    if (!input?.push) return () => {};
    cleanupShakaCue();
    let pendingCue = null;
    const deliver = cue => {
      if (!cue) return;
      const result = input.push(cue);
      if (result?.accepted || !["player-mismatch", "input-paused"].includes(result?.reason)) {
        pendingCue = null;
      } else {
        pendingCue = cue;
      }
      emit({
        type: result?.accepted ? "SIA_CAPTION_CHANGED" : "SIA_CAPTION_INPUT_REJECTED",
        platformId: ADAPTER_ID,
        source: cue.source,
        confidence: cue.sourceConfidence,
        state: result?.accepted ? "PRIMARY_READY" : undefined,
        safeToSpeak: cue.safeToSpeak === true,
        cue,
        reason: result?.reason || "accepted",
        via: "shaka-main-world-bridge",
      });
    };
    const onMessage = event => {
      if (event?.data?.type !== SHAKA_CUE_EVENT) return;
      const cue = event.data.cue;
      if (!cue || cue.platformId !== ADAPTER_ID || cue.source !== "shaka-caption") return;
      deliver(cue);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "SIA_SHAKA_CAPTION_BRIDGE_READY" }, location.origin);
    cleanupShakaCue = () => {
      window.removeEventListener("message", onMessage);
      pendingCue = null;
      cleanupShakaCue = () => {};
    };
    return () => {
      if (pendingCue) deliver(pendingCue);
    };
  }

  async function createAdapter(options) {
    const moduleUrl = chrome.runtime.getURL(ADAPTER_MODULE);
    const module = await import(moduleUrl);
    const input = globalThis.SiaCaptionInput;
    const emit = options.emit;
    const retryShakaCue = installShakaCueBridge(input, emit);
    return module.createUdemyAdapter({
      ...options,
      emit: event => {
        if (event?.type === "SIA_PLAYER_FOUND") {
          input?.setActivePlayer?.(event.playerIdentity);
          attachVideoInput(document.querySelector("video"), retryShakaCue);
          retryShakaCue();
        }
        if (event?.type === "SIA_CAPTION_CHANGED" && event.cue) {
          input?.push?.(event.cue);
        }
        if (event?.type === "SIA_PLATFORM_LEFT") {
          cleanupVideoInput();
          input?.setPaused?.(true);
          input?.setActivePlayer?.(null);
        }
        emit(event);
      },
    });
  }

  async function boot() {
    if (booted || !globalThis.SiaPlatformRouter || !globalThis.SiaCoreEventBridge) return;
    if (!isUdemyLecture(location.href)) return;
    booted = true;
    stopBridge = globalThis.SiaCoreEventBridge.install(window);
    stopDiagnostic = globalThis.SiaCoreDiagnostic?.install?.(window) || (() => {});
    globalThis.SiaPlatformRouter.register({
      id: ADAPTER_ID,
      matches: isUdemyLecture,
      create: createAdapter,
    });

    try {
      await globalThis.SiaPlatformRouter.start({
        documentRef: document,
        locationRef: window.location,
        windowRef: window,
      });
    } catch (error) {
      globalThis.SiaPlatformRouter.publish({
        type: "SIA_ADAPTER_ERROR",
        platformId: ADAPTER_ID,
        adapterVersion: "udemy-v0-experimental",
        reason: "adapter-bootstrap-failed",
        message: error?.message || String(error),
      }, window);
    }
  }

  window.addEventListener("pagehide", () => {
    stopBridge();
    stopDiagnostic();
    cleanupVideoInput();
    cleanupShakaCue();
    globalThis.SiaPlatformRouter?.stop?.();
    booted = false;
  }, { once: true });

  void boot();
})();
