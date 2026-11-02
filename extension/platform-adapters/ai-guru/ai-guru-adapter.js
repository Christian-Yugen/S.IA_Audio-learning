(() => {
  'use strict';
  const ID = 'ai-guru';
  const VERSION = 'ai-guru-v1-experimental';
  const HOSTS = new Set(['www.ai-guru-academy.com', 'ai-guru-academy.com']);
  function matches(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && HOSTS.has(u.hostname)
        && /^\/pt-br\/[^/]+\/[^/]+\/?$/.test(u.pathname);
    } catch { return false; }
  }
  function validCue(cue) {
    return Boolean(cue && String(cue.text || '').trim()
      && Number.isFinite(Number(cue.startTime)) && Number.isFinite(Number(cue.endTime))
      && Number(cue.startTime) >= 0 && Number(cue.endTime) > Number(cue.startTime));
  }
  function create({ documentRef = document, locationRef = location, windowRef = window,
    input = globalThis.SiaCaptionInput, emit = () => {}, onMediaChanged = () => {},
    fetchRef = globalThis.fetch?.bind(globalThis), parseVtt = globalThis.SiaYoutubeCaptionParser?.parseVtt,
    intervalMs = 100 } = {}) {
    let media = null, video = null, identity = null, signature = '', lastCue = '', timer = null;
    let running = false, revision = 0, fetched = [], fetchedLanguage = '', requestKey = '';
    let abort = null, timeout = null;
    const listeners = [], changedModes = new Map();
    let diagnostic = { platformId: ID, adapterVersion: VERSION, state: 'IDLE', reason: 'not-started', source: 'none', safeToSpeak: false };
    function update(state, reason, extra = {}) {
      const changed = diagnostic.state !== state || diagnostic.reason !== reason || diagnostic.source !== extra.source;
      diagnostic = { ...diagnostic, ...extra, state, reason, playerIdentity: identity };
      if (changed) emit({ type: state === 'ADAPTER_ERROR' ? 'SIA_ADAPTER_ERROR' : 'SIA_ADAPTER_FALLBACK', ...diagnostic });
    }
    function cancelRequest() {
      abort?.abort(); abort = null;
      if (timeout !== null) windowRef.clearTimeout?.(timeout);
      timeout = null;
    }
    function interrupt() {
      lastCue = '';
      input?.setPaused?.(true);
      input?.reset?.();
    }
    function detach() {
      for (const [node, name, fn] of listeners.splice(0)) node.removeEventListener?.(name, fn);
      for (const [track, mode] of changedModes) {
        try { if (track.mode === 'hidden') track.mode = mode; } catch {}
      }
      changedModes.clear();
      cancelRequest();
    }
    function nativeTracks() {
      try { return Array.from(video?.textTracks || []).filter(t => t.kind === 'subtitles' || t.kind === 'captions'); }
      catch { return []; }
    }
    function selectedTrack() {
      const tracks = nativeTracks();
      return tracks.find(t => t.mode === 'showing') || tracks.find(t => /^pt\b/i.test(t.language || '')) || tracks[0];
    }
    function chooseMedia() {
      video = documentRef.querySelector('[data-lesson-media] video[data-player="video"]');
      const audio = documentRef.querySelector('[data-lesson-media] audio[data-player="audio"]');
      if (audio && !audio.hidden && (!video || video.hidden)) return audio;
      return video && !video.hidden ? video : null;
    }
    function trackUrl() {
      const tracks = Array.from(video?.querySelectorAll?.('track[kind="subtitles"], track[kind="captions"]') || []);
      const active = selectedTrack();
      const element = tracks.find(t => t.track === active) || tracks.find(t => /^pt\b/i.test(t.srclang || '')) || tracks[0];
      if (!element) return null;
      try {
        const url = new URL(element.getAttribute('src'), locationRef.href);
        const page = new URL(locationRef.href);
        if (url.protocol !== 'https:' || url.origin !== page.origin || !/^\/captions\/[^/]+\.vtt$/.test(url.pathname)) return null;
        return { url: url.href, language: element.srclang || active?.language || 'en' };
      } catch { return null; }
    }
    function requestCaptions() {
      const source = trackUrl();
      if (!source || !fetchRef || !parseVtt || requestKey === source.url) return;
      requestKey = source.url;
      const ticket = revision;
      abort = typeof AbortController === 'function' ? new AbortController() : null;
      const controller = abort;
      timeout = windowRef.setTimeout?.(() => controller?.abort(), 12000);
      Promise.resolve().then(() => fetchRef(source.url, { credentials: 'same-origin', signal: controller?.signal }))
        .then(async response => {
          if (!response.ok) throw new Error('caption-http-' + response.status);
          if (response.url && new URL(response.url).origin !== new URL(locationRef.href).origin) throw new Error('caption-redirect-not-allowed');
          if (Number(response.headers?.get?.('content-length')) > 2_000_000) throw new Error('caption-too-large');
          const text = await response.text();
          if (text.length > 2_000_000) throw new Error('caption-too-large');
          return parseVtt(text).filter(validCue).slice(0, 10000);
        }).then(cues => {
          if (!running || ticket !== revision) return;
          if (!cues.length) throw new Error('caption-empty-or-invalid');
          fetched = cues; fetchedLanguage = source.language;
          tick();
        }).catch(error => {
          if (running && ticket === revision && !Array.from(selectedTrack()?.cues || []).some(validCue)) {
            update('WAITING_FOR_CAPTIONS', error?.message || 'caption-fetch-failed', { source: 'none', safeToSpeak: false });
          }
        }).finally(() => {
          if (ticket === revision) { if (timeout !== null) windowRef.clearTimeout?.(timeout); timeout = null; abort = null; }
        });
    }
    function bind(next, nextSignature) {
      detach(); interrupt(); revision++;
      media = next; signature = nextSignature; fetched = []; requestKey = ''; fetchedLanguage = '';
      identity = { videoId: nextSignature, containerId: 'ai-guru-' + (media?.tagName || 'video').toLowerCase() };
      onMediaChanged(media);
      input?.setActivePlayer?.(identity);
      emit({ type: 'SIA_PLAYER_FOUND', platformId: ID, adapterVersion: VERSION, playerIdentity: identity });
      const add = (name, fn) => { media.addEventListener?.(name, fn); listeners.push([media, name, fn]); };
      add('pause', () => { interrupt(); update('PAUSED', 'media-paused', { safeToSpeak: false }); });
      add('ended', () => { interrupt(); update('ENDED', 'media-ended', { safeToSpeak: false }); });
      add('seeking', () => { interrupt(); });
      add('seeked', tick); add('play', tick); add('loadedmetadata', tick); add('emptied', () => interrupt());
    }
    function tick() {
      if (!running) return;
      if (!matches(locationRef.href)) {
        if (media) { detach(); interrupt(); media = null; identity = null; revision++; onMediaChanged(null); input?.setActivePlayer?.(null); }
        update('PLATFORM_LEFT', 'unsupported-page', { safeToSpeak: false }); return;
      }
      const next = chooseMedia();
      if (!next) {
        if (media) { detach(); interrupt(); media = null; revision++; onMediaChanged(null); input?.setActivePlayer?.(null); }
        update('WAITING_FOR_PLAYER', 'player-not-found', { safeToSpeak: false }); return;
      }
      const page = new URL(locationRef.href);
      const nextSignature = page.origin + page.pathname + '|' + (next.getAttribute?.('src') || next.currentSrc || next.src || '');
      if (next !== media || signature !== nextSignature) bind(next, nextSignature);
      const track = selectedTrack();
      if (track?.mode === 'disabled') {
        try { if (!changedModes.has(track)) changedModes.set(track, track.mode); track.mode = 'hidden'; } catch {}
      }
      const native = Array.from(track?.cues || []).filter(validCue);
      const cues = native.length ? native : fetched;
      if (!cues.length) requestCaptions();
      if (media.paused || media.ended || media.seeking) {
        update('PAUSED', 'media-paused', { source: cues.length ? 'texttrack' : 'none', safeToSpeak: false }); return;
      }
      if (!cues.length) {
        update('WAITING_FOR_CAPTIONS', 'caption-source-not-ready', { source: 'none', safeToSpeak: false }); return;
      }
      if (input?.getStatus?.().paused !== false) input?.setPaused?.(false);
      if (diagnostic.state !== 'PRIMARY_READY') {
        diagnostic = { ...diagnostic, state: 'PRIMARY_READY', reason: 'temporal-captions-ready', source: 'texttrack', confidence: 'high', safeToSpeak: true };
        emit({ type: 'SIA_CAPTION_SOURCE_READY', ...diagnostic });
      }
      const time = Number(media.currentTime);
      // A half-open interval chooses one cue at boundaries and never speaks future text.
      const cue = cues.find(c => time >= Number(c.startTime) && time < Number(c.endTime));
      if (!cue) return;
      const key = [cue.startTime, cue.endTime, cue.text].join('|');
      if (key === lastCue) return;
      const normalized = { platformId: ID, adapterVersion: VERSION, text: String(cue.text).replace(/\s+/g, ' ').trim(),
        startTime: Number(cue.startTime), endTime: Number(cue.endTime), source: 'texttrack', sourceConfidence: 'high',
        safeToSpeak: true, playerIdentity: identity, sequenceId: key };
      const result = input?.push?.(normalized);
      if (result?.accepted || result?.reason === 'duplicate-cue') lastCue = key;
      emit({ type: result?.accepted ? 'SIA_CAPTION_CHANGED' : 'SIA_CAPTION_INPUT_REJECTED', platformId: ID,
        cue: normalized, reason: result?.reason, state: 'PRIMARY_READY' });
    }
    return Object.freeze({
      start() {
        if (running) return diagnostic;
        running = true; input?.registerPlatform?.(ID);
        emit({ type: 'SIA_PLATFORM_DETECTED', platformId: ID, adapterVersion: VERSION });
        tick(); timer = windowRef.setInterval?.(tick, intervalMs); return diagnostic;
      },
      stop() {
        if (!running) return;
        running = false; revision++; detach(); interrupt();
        windowRef.clearInterval?.(timer); timer = null; media = null; identity = null;
        onMediaChanged(null); input?.setActivePlayer?.(null);
        emit({ type: 'SIA_PLATFORM_LEFT', platformId: ID, adapterVersion: VERSION });
      },
      tick, getMedia: () => media,
      getCaptionLanguage: () => selectedTrack()?.language || fetchedLanguage || 'en',
      getDiagnostic: () => ({ ...diagnostic, playerIdentity: identity })
    });
  }
  globalThis.SiaAiGuruAdapter = Object.freeze({ matches, create, validCue, ID, VERSION });
})();
