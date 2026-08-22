import {
  ADAPTER_VERSION,
  CONFIDENCE,
  EVENTS,
  PLATFORM_ID,
  SOURCES,
  STATES,
  buildDiagnostic,
  deriveState,
  isSamePlayer,
  isUdemyLectureUrl,
  normalizeCue,
  normalizePlayerIdentity,
  shouldEmitCue,
} from './udemy-adapter-contract.js';

const DOM_CAPTION_SELECTORS = Object.freeze([
  '[data-purpose="caption"]',
  '[class*="captions-display"]',
  '[class*="caption--captions"]',
]);

const TRANSCRIPT_SELECTORS = Object.freeze([
  '[data-purpose="transcript"]',
  '[data-purpose="transcript-panel"]',
  '[class*="transcript"]',
]);

function textFromNode(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function queryFirstText(documentRef, selectors) {
  for (const selector of selectors) {
    const nodes = typeof documentRef?.querySelectorAll === 'function'
      ? Array.from(documentRef.querySelectorAll(selector))
      : [];
    for (const node of nodes) {
      const text = textFromNode(node);
      if (text) return { selector, node, text };
    }
  }
  return null;
}

function activeCueFromTrack(track) {
  try {
    const active = track?.activeCues ? Array.from(track.activeCues) : [];
    return active.find((cue) => Number.isFinite(Number(cue.startTime)) && Number.isFinite(Number(cue.endTime))) || null;
  } catch {
    return null;
  }
}

function tracksFromVideo(video) {
  try {
    return video?.textTracks ? Array.from(video.textTracks) : [];
  } catch {
    return [];
  }
}

export class UdemyAdapter {
  constructor({ documentRef, locationRef, windowRef, emit, mutationFilter } = {}) {
    this.documentRef = documentRef || globalThis.document;
    this.locationRef = locationRef || globalThis.location;
    this.windowRef = windowRef || globalThis.window;
    this.emit = typeof emit === 'function' ? emit : () => {};
    this.mutationFilter = typeof mutationFilter === 'function'
      ? mutationFilter
      : (mutation) => {
        const target = mutation?.target;
        return target?.dataset?.siaDiagnostic !== 'true'
          && !target?.closest?.('[data-sia-diagnostic="true"]');
      };
    this.state = STATES.IDLE;
    this.started = false;
    this.destroyed = false;
    this.video = null;
    this.playerIdentity = null;
    this.previousCue = null;
    this.videoListeners = [];
    this.trackListeners = [];
    this.pageObserver = null;
    this.pollHandle = null;
    this.scanScheduled = false;
    this.lastDiagnosticKey = '';
    this.lastDiagnostic = null;
    this.lastSourceKey = '';
    this.lastFallbackKey = '';
    this.lastProbe = null;
  }

  currentUrl() {
    return String(this.locationRef?.href || '');
  }

  start() {
    if (this.started && !this.destroyed) return this.getDiagnostic();
    this.started = true;
    this.destroyed = false;
    if (!isUdemyLectureUrl(this.currentUrl())) {
      this.state = STATES.IDLE;
      return this.publishDiagnostic({
        playerFound: false,
        source: SOURCES.NONE,
        confidence: CONFIDENCE.UNKNOWN,
        reason: 'url-not-compatible',
      });
    }

    this.state = STATES.PLATFORM_DETECTED;
    this.emit({ type: EVENTS.PLATFORM_DETECTED, platformId: PLATFORM_ID, adapterVersion: ADAPTER_VERSION });
    this.installPageObserver();
    this.installPolling();
    return this.scan();
  }

  stop() {
    if (!this.started && this.state === STATES.IDLE) return;
    this.state = STATES.DESTROYING;
    this.removeVideoListeners();
    this.removeTrackListeners();
    this.pageObserver?.disconnect?.();
    this.pageObserver = null;
    if (this.pollHandle !== null) {
      this.windowRef?.clearInterval?.(this.pollHandle);
      this.pollHandle = null;
    }
    this.video = null;
    this.playerIdentity = null;
    this.previousCue = null;
    this.lastSourceKey = '';
    this.lastFallbackKey = '';
    this.lastProbe = null;
    this.started = false;
    this.destroyed = true;
    this.emit({ type: EVENTS.PLATFORM_LEFT, platformId: PLATFORM_ID, adapterVersion: ADAPTER_VERSION });
  }

  installPageObserver() {
    const Observer = this.windowRef?.MutationObserver || globalThis.MutationObserver;
    if (!Observer || !this.documentRef?.documentElement) return;
    this.pageObserver?.disconnect?.();
    this.pageObserver = new Observer((mutations) => {
      const relevant = mutations.some((mutation) => {
        try {
          return this.mutationFilter(mutation) !== false;
        } catch {
          return true;
        }
      });
      if (relevant) this.scheduleScan();
    });
    this.pageObserver.observe(this.documentRef.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-current', 'data-purpose'],
    });
  }

  installPolling() {
    if (this.pollHandle !== null || !this.windowRef?.setInterval) return;
    this.pollHandle = this.windowRef.setInterval(() => this.scan(), 1000);
  }

  inspectVideo() {
    const selectors = ['video[data-purpose]', 'video[id^="lecture-"], video'];
    const count = (selector) => {
      try {
        return typeof this.documentRef?.querySelectorAll === 'function'
          ? this.documentRef.querySelectorAll(selector).length
          : 0;
      } catch {
        return 0;
      }
    };
    const probe = {
      documentVideos: count('video'),
      iframeCount: count('iframe'),
      shakaContainers: count('[id^="shaka-video-container-"], [data-purpose="shaka-video-player"]'),
      matchedSelector: null,
      searchScope: 'document',
    };
    for (const selector of selectors) {
      try {
        const video = this.documentRef?.querySelector?.(selector) || null;
        if (video) {
          probe.matchedSelector = selector;
          return { video, probe };
        }
      } catch {
        // Continue to the next selector while preserving the diagnostic probe.
      }
    }
    return { video: null, probe };
  }

  findVideo() {
    return this.inspectVideo().video;
  }

  removeVideoListeners() {
    for (const { target, name, listener } of this.videoListeners) {
      target.removeEventListener?.(name, listener);
    }
    this.videoListeners = [];
  }

  removeTrackListeners() {
    for (const { target, listener } of this.trackListeners) {
      target.removeEventListener?.('cuechange', listener);
    }
    this.trackListeners = [];
  }

  installTrackListeners(video) {
    const tracks = tracksFromVideo(video).filter((track) => track?.addEventListener);
    const sameTracks = tracks.length === this.trackListeners.length
      && tracks.every((track) => this.trackListeners.some((entry) => entry.target === track));
    if (sameTracks) return;

    this.removeTrackListeners();
    for (const track of tracks) {
      const listener = () => this.scheduleScan();
      track.addEventListener('cuechange', listener, { passive: true });
      this.trackListeners.push({ target: track, listener });
    }
  }

  scheduleScan() {
    if (this.scanScheduled || this.destroyed) return;
    this.scanScheduled = true;
    const run = () => {
      this.scanScheduled = false;
      this.scan();
    };
    if (typeof this.windowRef?.setTimeout === 'function') this.windowRef.setTimeout(run, 0);
    else run();
  }

  installVideoListeners(video) {
    this.removeVideoListeners();
    if (!video?.addEventListener) return;
    for (const name of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'emptied', 'ended', 'ratechange']) {
      const listener = () => this.scheduleScan();
      video.addEventListener(name, listener, { passive: true });
      this.videoListeners.push({ target: video, name, listener });
    }
  }

  reconcileVideo(video) {
    const nextIdentity = normalizePlayerIdentity(video);
    if (isSamePlayer(this.playerIdentity, nextIdentity)) {
      this.installTrackListeners(video);
      return;
    }
    if (this.video && video !== this.video) {
      this.previousCue = null;
      this.lastSourceKey = '';
      this.lastFallbackKey = '';
      this.emit({ type: EVENTS.ADAPTER_FALLBACK, platformId: PLATFORM_ID, reason: 'player-identity-changed' });
    }
    this.removeVideoListeners();
    this.removeTrackListeners();
    this.video = video;
    this.playerIdentity = nextIdentity;
    this.installVideoListeners(video);
    this.installTrackListeners(video);
    if (video) this.emit({ type: EVENTS.PLAYER_FOUND, platformId: PLATFORM_ID, playerIdentity: nextIdentity });
  }

  readPrimaryCue(video) {
    const tracks = tracksFromVideo(video);
    for (const track of tracks) {
      const cue = activeCueFromTrack(track);
      if (!cue) continue;
      return normalizeCue({
        text: cue.text,
        startTime: cue.startTime,
        endTime: cue.endTime,
        source: SOURCES.TEXT_TRACK,
        sourceConfidence: CONFIDENCE.HIGH,
        playerIdentity: this.playerIdentity,
      });
    }
    return null;
  }

  readDomFallback() {
    const caption = queryFirstText(this.documentRef, DOM_CAPTION_SELECTORS);
    if (caption) {
      return normalizeCue({
        text: caption.text,
        startTime: null,
        endTime: null,
        source: SOURCES.DOM_CAPTION,
        sourceConfidence: CONFIDENCE.LOW,
        playerIdentity: this.playerIdentity,
      });
    }
    const transcript = queryFirstText(this.documentRef, TRANSCRIPT_SELECTORS);
    if (transcript) {
      return normalizeCue({
        text: transcript.text,
        startTime: null,
        endTime: null,
        source: SOURCES.TRANSCRIPT,
        sourceConfidence: CONFIDENCE.LOW,
        playerIdentity: this.playerIdentity,
      });
    }
    return null;
  }

  scan() {
    if (this.destroyed) return this.getDiagnostic();
    if (!isUdemyLectureUrl(this.currentUrl())) {
      this.state = STATES.IDLE;
      return this.publishDiagnostic({ playerFound: false, source: SOURCES.NONE, confidence: CONFIDENCE.UNKNOWN, reason: 'url-not-compatible' });
    }

    const videoResult = this.inspectVideo();
    const video = videoResult.video;
    this.lastProbe = videoResult.probe;
    this.reconcileVideo(video);
    if (!video) {
      this.state = STATES.PLATFORM_DETECTED;
      return this.publishDiagnostic({
        playerFound: false,
        source: SOURCES.NONE,
        confidence: CONFIDENCE.UNKNOWN,
        reason: 'player-not-found',
        probe: this.lastProbe,
      });
    }

    const primaryCue = this.readPrimaryCue(video);
    const fallbackCue = primaryCue ? null : this.readDomFallback();
    const cue = primaryCue || fallbackCue;
    const source = cue?.source || SOURCES.NONE;
    const confidence = cue?.sourceConfidence || CONFIDENCE.UNKNOWN;
    const hasTemporalCue = Boolean(cue?.startTime !== null && cue?.endTime !== null);
    this.state = deriveState({
      playerFound: true,
      source,
      confidence,
      hasTemporalCue,
    });

    const sourceKey = JSON.stringify({ source, confidence, state: this.state, playerIdentity: this.playerIdentity });
    if (cue && primaryCue && shouldEmitCue(cue, this.previousCue)) {
      this.previousCue = cue;
      this.emit({ type: EVENTS.CAPTION_CHANGED, cue, state: this.state });
    } else if (cue && !primaryCue) {
      const fallbackKey = JSON.stringify({ source, confidence, text: cue.text, playerIdentity: this.playerIdentity });
      if (fallbackKey !== this.lastFallbackKey) {
        this.lastFallbackKey = fallbackKey;
        this.emit({ type: EVENTS.ADAPTER_FALLBACK, source, confidence, state: this.state, safeToSpeak: false });
      }
    }
    if (source !== SOURCES.NONE && sourceKey !== this.lastSourceKey) {
      this.lastSourceKey = sourceKey;
      this.emit({ type: EVENTS.CAPTION_SOURCE_READY, source, confidence, state: this.state, safeToSpeak: Boolean(cue?.safeToSpeak) });
    }
    return this.publishDiagnostic({
      playerFound: true,
      source,
      confidence,
      reason: primaryCue ? 'texttrack-cue-valid' : (fallbackCue ? 'visible-text-without-confirmed-timing' : 'caption-source-unavailable'),
      cue,
      probe: this.lastProbe,
    });
  }

  publishDiagnostic(input) {
    const diagnostic = buildDiagnostic({
      ...input,
      state: this.state,
      playerIdentity: this.playerIdentity,
      probe: input.probe || this.lastProbe,
    });
    const key = JSON.stringify(diagnostic);
    this.lastDiagnostic = diagnostic;
    if (key !== this.lastDiagnosticKey) this.lastDiagnosticKey = key;
    return diagnostic;
  }

  getDiagnostic() {
    return this.lastDiagnostic || buildDiagnostic({
      state: this.state,
      playerFound: Boolean(this.video),
      source: SOURCES.NONE,
      confidence: CONFIDENCE.UNKNOWN,
      reason: 'not-scanned',
      playerIdentity: this.playerIdentity,
      probe: this.lastProbe,
    });
  }
}

export function createUdemyAdapter(options) {
  return new UdemyAdapter(options);
}
