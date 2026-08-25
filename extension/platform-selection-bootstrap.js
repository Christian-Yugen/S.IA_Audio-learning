(() => {
  "use strict";

  function requestActivation() {
    try {
      const url = location.href;
      const host = location.hostname.toLowerCase();
      const isYoutube = location.protocol === "https:"
        && ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)
        && location.pathname === "/watch"
        && Boolean(new URL(url).searchParams.get("v"));
      if (!isYoutube) return;
      void chrome.runtime.sendMessage({
        target: "sia-platform-bootstrap-request",
        platformId: "youtube",
        url
      });
    } catch {
      // A página ou a extensão pode estar sendo substituída durante a navegação.
    }
  }

  requestActivation();
  chrome.storage.onChanged?.addListener((_changes, areaName) => {
    if (areaName === "local" || areaName === "session") requestActivation();
  });
  window.addEventListener("yt-navigate-finish", requestActivation, { passive: true });
  window.addEventListener("popstate", requestActivation, { passive: true });
})();
