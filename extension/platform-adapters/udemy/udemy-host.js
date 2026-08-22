(() => {
  "use strict";

  const ADAPTER_ID = "udemy";
  const ADAPTER_MODULE = "platform-adapters/udemy/udemy-adapter.js";
  let stopBridge = () => {};
  let stopDiagnostic = () => {};
  let cleanupVideoInput = () => {};
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

  function attachVideoInput(video) {
    cleanupVideoInput();
    const input = globalThis.SiaCaptionInput;
    if (!input || !video?.addEventListener) return;
    const onPause = () => input.setPaused(true);
    const onPlay = () => input.setPaused(false);
    video.addEventListener("pause", onPause, { passive: true });
    video.addEventListener("play", onPlay, { passive: true });
    cleanupVideoInput = () => {
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      cleanupVideoInput = () => {};
    };
  }

  async function createAdapter(options) {
    const moduleUrl = chrome.runtime.getURL(ADAPTER_MODULE);
    const module = await import(moduleUrl);
    const input = globalThis.SiaCaptionInput;
    const emit = options.emit;
    return module.createUdemyAdapter({
      ...options,
      emit: event => {
        if (event?.type === "SIA_PLAYER_FOUND") {
          input?.setActivePlayer?.(event.playerIdentity);
          attachVideoInput(document.querySelector("video"));
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
    globalThis.SiaPlatformRouter?.stop?.();
    booted = false;
  }, { once: true });

  void boot();
})();
