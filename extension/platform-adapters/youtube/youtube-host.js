(() => {
  'use strict';

  const ADAPTER_ID = 'youtube';
  const ADAPTER_MODULE = 'platform-adapters/youtube/youtube-adapter.js';
  const ADAPTER_VERSION = 'youtube-v0-experimental';
  const TIMED_CUES_EVENT = 'SIA_YOUTUBE_TIMED_CUES';
  const STATUS_EVENT = 'SIA_YOUTUBE_TIMED_CUES_STATUS';
  const READY_EVENT = 'SIA_YOUTUBE_TIMED_CUES_READY';
  let stopBridge = () => {};
  let stopDiagnostic = () => {};
  let cleanupVideoInput = () => {};
  let cleanupTimedCues = () => {};
  let requestTimedCueReplay = () => {};
  let booted = false;
  let whisperActive = false;
  let nativeReady = false;
  let whisperLanguage = 'en';

  function isYoutubeWatch(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return parsed.protocol === 'https:'
        && ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)
        && parsed.pathname === '/watch'
        && Boolean(parsed.searchParams.get('v'));
    } catch {
      return false;
    }
  }

  function attachVideoInput(video) {
    cleanupVideoInput();
    const input = globalThis.SiaCaptionInput;
    if (!input || !video?.addEventListener) return;
    input.setPaused(Boolean(video.paused || video.ended));
    const onPause = () => input.setPaused(true);
    const onPlay = () => input.setPaused(false);
    video.addEventListener('pause', onPause, { passive: true });
    video.addEventListener('play', onPlay, { passive: true });
    video.addEventListener('emptied', onPause, { passive: true });
    cleanupVideoInput = () => {
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('emptied', onPause);
      cleanupVideoInput = () => {};
    };
  }

  function installTimedCueBridge(adapter, emit) {
    if (!adapter || typeof window?.addEventListener !== 'function') return;
    const currentVideoId = () => {
      try { return new URL(location.href).searchParams.get('v') || ''; } catch { return ''; }
    };
    const validPayload = data => Boolean(
      data
      && typeof data.videoId === 'string'
      && data.videoId.trim()
      && typeof data.trackKey === 'string'
      && data.trackKey.trim()
      && data.source === 'youtube-timedtext'
      && data.sourceConfidence === 'high'
      && Array.isArray(data.cues)
      && data.cues.length > 0
      && data.cues.length <= 20000
      && data.cues.every(cue => Boolean(
        cue
        && typeof cue.text === 'string'
        && cue.text.trim()
        && Number.isFinite(Number(cue.startTime))
        && Number.isFinite(Number(cue.endTime))
        && Number(cue.startTime) >= 0
        && Number(cue.endTime) > Number(cue.startTime)
      ))
    );
    requestTimedCueReplay = () => window.postMessage({ type: READY_EVENT }, location.origin);
    globalThis.SiaYoutubeWhisper = {
      hasNative: () => nativeReady,
      language: () => whisperActive ? whisperLanguage : 'en',
      set(data) {
        if (data.videoId !== currentVideoId() || !Array.isArray(data.cues) || data.cues.length > 20000) return false;
        if (!data.cues.every(c => c.text && Number.isFinite(c.startTime) && Number.isFinite(c.endTime) && c.startTime >= 0 && c.endTime > c.startTime)) return false;
        whisperActive = true;
        whisperLanguage = data.language || 'en';
        if (data.cues.length) adapter.setExternalTimedCues({ videoId: data.videoId, trackKey: 'whisper-' + data.videoId, cues: data.cues });
        return true;
      },
      clear() {
        if (!whisperActive) return;
        whisperActive = false;
        adapter.clearExternalTimedCues();
        requestTimedCueReplay();
      }
    };
    const onMessage = event => {
      if (event?.origin !== location.origin || (event.source && event.source !== window)) return;
      const data = event?.data || {};
      if (data.type === TIMED_CUES_EVENT) {
        if (!validPayload(data) || data.videoId !== currentVideoId()) return;
        nativeReady = true;
        if (!whisperActive) adapter.setExternalTimedCues?.(data);
        return;
      }
      if (!whisperActive && data.type === STATUS_EVENT && data.state === 'ERROR') {
        const source = String(data.source || '').trim() || (data.client ? `youtube-${String(data.client).toLowerCase()}` : 'youtube-overlay');
        const reason = String(data.reason || 'timedtext-unavailable');
        const client = String(data.client || '').trim().toLowerCase();
        emit({
          type: 'SIA_ADAPTER_FALLBACK',
          platformId: ADAPTER_ID,
          adapterVersion: ADAPTER_VERSION,
          source,
          confidence: 'low',
          state: 'UNSAFE_TO_SPEAK',
          safeToSpeak: false,
          reason: client ? `${client}-${reason}` : reason,
        });
      }
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: READY_EVENT }, location.origin);
    cleanupTimedCues = () => {
      window.removeEventListener('message', onMessage);
      cleanupTimedCues = () => {};
      requestTimedCueReplay = () => {};
    };
  }

  async function createAdapter(options) {
    const moduleUrl = chrome.runtime.getURL(ADAPTER_MODULE);
    const module = await import(moduleUrl);
    const input = globalThis.SiaCaptionInput;
    const emit = options.emit;
    const adapter = await module.createYoutubeAdapter({
      ...options,
      emit: event => {
        if (event?.type === 'SIA_PLATFORM_LEFT') { nativeReady = false; whisperActive = false; }
        if (event?.type === 'SIA_CAPTION_CHANGED' && event.cue?.source === 'youtube-track' && event.cue.safeToSpeak) nativeReady = true;
        if (event?.type === 'SIA_PLAYER_FOUND') {
          input?.setActivePlayer?.(event.playerIdentity);
          attachVideoInput(document.querySelector('video'));
          requestTimedCueReplay();
        }
        if (event?.type === 'SIA_CAPTION_CHANGED' && event.cue) input?.push?.(event.cue);
        if (event?.type === 'SIA_PLATFORM_LEFT') {
          cleanupVideoInput();
          input?.setPaused?.(true);
          input?.setActivePlayer?.(null);
        }
        emit(event);
      },
    });
    return adapter;
  }

  async function boot() {
    if (booted || !globalThis.SiaPlatformRouter || !globalThis.SiaCoreEventBridge) return;
    if (!isYoutubeWatch(location.href)) return;
    booted = true;
    globalThis.SiaCaptionInput?.registerPlatform?.(ADAPTER_ID);
    stopBridge = globalThis.SiaCoreEventBridge.install(window);
    stopDiagnostic = globalThis.SiaCoreDiagnostic?.install?.(window) || (() => {});
    globalThis.SiaPlatformRouter.register({ id: ADAPTER_ID, matches: isYoutubeWatch, create: createAdapter });
    try {
      const started = await globalThis.SiaPlatformRouter.start({
        documentRef: document,
        locationRef: window.location,
        windowRef: window,
      });
      if (started?.adapter) {
        installTimedCueBridge(started.adapter, event => globalThis.SiaPlatformRouter.publish(event, window));
      }
    } catch (error) {
      globalThis.SiaPlatformRouter.publish({
        type: 'SIA_ADAPTER_ERROR',
        platformId: ADAPTER_ID,
        adapterVersion: ADAPTER_VERSION,
        reason: 'adapter-bootstrap-failed',
        message: error?.message || String(error),
      }, window);
    }
  }

  window.addEventListener('pagehide', () => {
    stopBridge();
    stopDiagnostic();
    cleanupVideoInput();
    cleanupTimedCues();
    globalThis.SiaPlatformRouter?.stop?.();
    booted = false;
  }, { once: true });

  void boot();
})();
