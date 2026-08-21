(() => {
  "use strict";

  const ADAPTER_ID = "udemy";
  const ADAPTER_MODULE = "platform-adapters/udemy/udemy-adapter.js";
  let stopBridge = () => {};
  let stopDiagnostic = () => {};
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

  async function createAdapter(options) {
    const moduleUrl = chrome.runtime.getURL(ADAPTER_MODULE);
    const module = await import(moduleUrl);
    return module.createUdemyAdapter(options);
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
    globalThis.SiaPlatformRouter?.stop?.();
    booted = false;
  }, { once: true });

  void boot();
})();
