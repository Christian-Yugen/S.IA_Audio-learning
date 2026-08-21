(() => {
  "use strict";

  const EVENT_NAME = "SIA_PLATFORM_EVENT";
  let active = null;
  const registrations = [];

  function cloneEvent(event) {
    if (!event || typeof event !== "object") return { type: "unknown" };
    return {
      ...event,
      cue: event.cue ? { ...event.cue, playerIdentity: event.cue.playerIdentity || null } : undefined,
    };
  }

  function publish(event, windowRef = globalThis.window) {
    const detail = cloneEvent(event);
    if (typeof windowRef?.dispatchEvent !== "function" || typeof windowRef?.CustomEvent !== "function") return detail;
    windowRef.dispatchEvent(new windowRef.CustomEvent(EVENT_NAME, { detail }));
    if (detail.type && detail.type !== EVENT_NAME) {
      windowRef.dispatchEvent(new windowRef.CustomEvent(detail.type, { detail }));
    }
    return detail;
  }

  function register({ id, matches, create }) {
    if (!id || typeof matches !== "function" || typeof create !== "function") {
      throw new TypeError("Registro de adaptador inválido");
    }
    if (registrations.some(item => item.id === id)) return false;
    registrations.push(Object.freeze({ id, matches, create }));
    return true;
  }

  function destroyActive() {
    active?.adapter?.stop?.();
    active = null;
  }

  async function start({ documentRef = globalThis.document, locationRef = globalThis.location, windowRef = globalThis.window } = {}) {
    destroyActive();
    const registration = registrations.find(item => {
      try {
        return item.matches(locationRef?.href || "");
      } catch {
        return false;
      }
    });
    if (!registration) {
      publish({ type: "SIA_PLATFORM_UNKNOWN", platformId: null }, windowRef);
      return null;
    }

    const adapter = await registration.create({
      documentRef,
      locationRef,
      windowRef,
      emit: event => publish(event, windowRef),
    });
    active = { id: registration.id, adapter };
    const diagnostic = adapter?.start?.() || adapter?.getDiagnostic?.() || null;
    publish({
      type: "SIA_PLATFORM_ROUTER_STARTED",
      platformId: registration.id,
      diagnostic,
    }, windowRef);
    return { id: registration.id, adapter, diagnostic };
  }

  function stop() {
    destroyActive();
  }

  function getActive() {
    return active ? { id: active.id, adapter: active.adapter } : null;
  }

  globalThis.SiaPlatformRouter = Object.freeze({
    EVENT_NAME,
    register,
    start,
    stop,
    getActive,
    publish,
  });
})();
