(() => {
  "use strict";

  const MODES = Object.freeze({
    AUTO: "auto",
    COURSERA: "coursera",
    UDEMY: "udemy",
    YOUTUBE: "youtube",
    AI_GURU: "ai-guru",
    OFF: "off"
  });
  const PLATFORM_LABELS = Object.freeze({
    auto: "Automático",
    coursera: "Coursera",
    udemy: "Udemy",
    youtube: "YouTube",
    "ai-guru": "AI Guru Academy",
    off: "Desativado"
  });

  function normalizePlatform(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(PLATFORM_LABELS, normalized)
      ? normalized
      : MODES.AUTO;
  }

  function hostKeyFromUrl(url) {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      if (host === "coursera.org" || host.endsWith(".coursera.org")) return "coursera.org";
      if (host === "udemy.com" || host.endsWith(".udemy.com")) return "udemy.com";
      if (host === "youtube.com" || host.endsWith(".youtube.com")) return "youtube.com";
      return host;
    } catch {
      return "";
    }
  }

  function platformForHost(host) {
    const value = String(host || "").toLowerCase().replace(/^www\./, "");
    if (value === "ai-guru-academy.com") return MODES.AI_GURU;
    if (value === "coursera.org" || value.endsWith(".coursera.org")) return MODES.COURSERA;
    if (value === "udemy.com" || value.endsWith(".udemy.com")) return MODES.UDEMY;
    if (value === "youtube.com" || value.endsWith(".youtube.com")) return MODES.YOUTUBE;
    return "";
  }

  function defaultModeForHost(host) {
    const platform = platformForHost(host);
    return platform === MODES.YOUTUBE ? MODES.OFF : platform ? MODES.AUTO : MODES.OFF;
  }

  function defaultModeForUrl(url) {
    return defaultModeForHost(hostKeyFromUrl(url));
  }

  function supportedPageForPlatform(url, platform) {
    try {
      const parsed = new URL(url);
      const normalized = normalizePlatform(platform);
      if (normalized === MODES.AI_GURU) return parsed.protocol === "https:" && /^\/pt-br\/[^/]+\/[^/]+\/?$/.test(parsed.pathname);
      if (normalized === MODES.YOUTUBE) {
        return parsed.pathname === "/watch" && Boolean(parsed.searchParams.get("v"));
      }
      if (normalized === MODES.UDEMY) {
        return /^\/course\/[^/]+\/learn\/lecture\/[^/?#]+/i.test(parsed.pathname);
      }
      return normalized === MODES.COURSERA || normalized === MODES.AUTO || normalized === MODES.OFF;
    } catch {
      return false;
    }
  }

  function isCompatible(url, platform) {
    const requested = normalizePlatform(platform);
    const detected = platformForHost(hostKeyFromUrl(url));
    if (requested === MODES.AUTO) return Boolean(detected) && supportedPageForPlatform(url, detected);
    if (requested === MODES.OFF) return true;
    return detected === requested && supportedPageForPlatform(url, requested);
  }

  function describeSelection(url, requested) {
    const normalized = normalizePlatform(requested);
    const detected = platformForHost(hostKeyFromUrl(url));
    if (!detected) {
      return Object.freeze({
        detected: "",
        requested: normalized,
        compatible: false,
        state: "unsupported-page",
        message: "Esta página ainda não possui um adaptador S·IA."
      });
    }
    if (normalized === MODES.OFF) {
      return Object.freeze({
        detected,
        requested: normalized,
        compatible: true,
        state: "disabled",
        message: "A S·IA está desativada nesta página."
      });
    }
    if (normalized === MODES.AUTO || normalized === detected) {
      return Object.freeze({
        detected,
        requested: normalized,
        compatible: true,
        state: normalized === MODES.AUTO ? "automatic" : "manual",
        message: `${PLATFORM_LABELS[detected]} selecionado para esta página.`
      });
    }
    return Object.freeze({
      detected,
      requested: normalized,
      compatible: false,
      state: "mismatch",
      message: `${PLATFORM_LABELS[normalized]} foi selecionado, mas esta aba está em ${PLATFORM_LABELS[detected]}.`
    });
  }

  globalThis.SiaPlatformSelection = Object.freeze({
    MODES,
    PLATFORM_LABELS,
    normalizePlatform,
    defaultModeForHost,
    defaultModeForUrl,
    supportedPageForPlatform,
    hostKeyFromUrl,
    platformForHost,
    isCompatible,
    describeSelection
  });
})();
