(() => {
  'use strict';
  const api = globalThis.SiaAiGuruAdapter;
  if (!api?.matches(location.href) || !globalThis.SiaPlatformRouter || globalThis.SiaAiGuruHost) return;
  let current = null, adapter = null;
  globalThis.SiaAiGuruHost = Object.freeze({ getMedia: () => current, getCaptionLanguage: () => adapter?.getCaptionLanguage?.() || "en" });
  const stopBridge = globalThis.SiaCoreEventBridge?.install(window) || (() => {});
  const stopDiagnostic = globalThis.SiaCoreDiagnostic?.install(window) || (() => {});
  globalThis.SiaPlatformRouter.register({
    id: api.ID, matches: api.matches,
    create: options => { adapter = api.create({ ...options, onMediaChanged: media => { current = media; } }); return adapter; }
  });
  void globalThis.SiaPlatformRouter.start({ documentRef: document, locationRef: location, windowRef: window }).catch(error => {
    globalThis.SiaPlatformRouter.publish({ type: 'SIA_ADAPTER_ERROR', platformId: api.ID,
      adapterVersion: api.VERSION, state: 'ADAPTER_ERROR', reason: 'adapter-bootstrap-failed', message: error?.message || String(error) }, window);
  });
  window.addEventListener('pagehide', () => {
    globalThis.SiaPlatformRouter.stop(); stopBridge(); stopDiagnostic(); current = null;
  }, { once: true });
})();
