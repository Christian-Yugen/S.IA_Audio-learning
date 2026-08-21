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
  constructor({ documentRef, locationRef, windowRef, emit } = {}) {
    this.documentRef = documentRef || globalThis.document;
    this.locationRef = locationRef || globalThis.location;
    this.windowRef = windowRef || globalThis.window;
    this.emit = typeof emit === 'function' ? emit : () => {};
    this.state = STATES.IDLE;
    this.started = false;
    this.destroyed = false;
    this.video = null;
    this.playerIdentity = null;
    this.previousCue = null;
    this.videoListeners = [];
    this.pageObserver = null;
    this.pollHandle = null;
    this.lastDiagnosticKey = '';
    this.lastDiagnostic = null;
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
    this.pageObserver?.disconnect?.();
    this.pageObserver = null;
    if (this.pollHandle !== null) {
      this.windowRef?.clearInterval?.(this.pollHandle);
      this.pollHandle = null;
    }
    this.video = null;
    this.playerIdentity = null;
    this.previousCue = null;
    this.started = false;
    this.destroyed = true;
    this.emit({ type: EVENTS.PLATFORM_LEFT, platformId: PLATFORM_ID, adapterVersion: ADAPTER_VERSION });
  }

  installPageObserver() {
    const Observer = this.windowRef?.MutationObserver || globalThis.MutationObserver;
    if (!Observer || !this.documentRef?.documentElement) return;
    this.pageObserver?.disconnect?.();
    this.pageObserver = new Observer(() => this.scan());
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

  findVideo() {
    return this.documentRef?.querySelector?.('video[data-purpose], video[id^="lecture-"], video') || null;
  }

  removeVideoListeners() {
    for (const { target, name, listener } of this.videoListeners) {
      target.removeEventListener?.(name, listener);
    }
    this.videoListeners = [];
  }

  installVideoListeners(video) {
    this.removeVideoListeners();
    if (!video?.addEventListener) return;
    for (const name of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'emptied', 'ended', 'ratechange']) {
      const listener = () => this.scan();
      video.addEventListener(name, listener, { passive: true });
      this.videoListeners.push({ target: video, name, listener });
    }
  }

  reconcileVideo(video) {
    const nextIdentity = normalizePlayerIdentity(video);
    if (isSamePlayer(this.playerIdentity, nextIdentity)) return;
    if (this.video && video !== this.video) {
      this.previousCue = null;
      this.emit({ type: EVENTS.ADAPTER_FALLBACK, platformId: PLATFORM_ID, reason: 'player-identity-changed' });
    }
    this.removeVideoListeners();
    this.video = video;
    this.playerIdentity = nextIdentity;
    this.installVideoListeners(video);
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

    const video = this.findVideo();
    this.reconcileVideo(video);
    if (!video) {
      this.state = STATES.PLATFORM_DETECTED;
      return this.publishDiagnostic({ playerFound: false, source: SOURCES.NONE, confidence: CONFIDENCE.UNKNOWN, reason: 'player-not-found' });
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

    if (cue && primaryCue && shouldEmitCue(cue, this.previousCue)) {
      this.previousCue = cue;
      this.emit({ type: EVENTS.CAPTION_CHANGED, cue, state: this.state });
    } else if (cue && !primaryCue) {
      this.emit({ type: EVENTS.ADAPTER_FALLBACK, source, confidence, state: this.state, safeToSpeak: false });
    }
    if (source !== SOURCES.NONE) {
      this.emit({ type: EVENTS.CAPTION_SOURCE_READY, source, confidence, state: this.state, safeToSpeak: Boolean(cue?.safeToSpeak) });
    }
    return this.publishDiagnostic({
      playerFound: true,
      source,
      confidence,
      reason: primaryCue ? 'texttrack-cue-valid' : (fallbackCue ? 'visible-text-without-confirmed-timing' : 'caption-source-unavailable'),
      cue,
    });
  }

  publishDiagnostic(input) {
    const diagnostic = buildDiagnostic({ ...input, state: this.state, playerIdentity: this.playerIdentity });
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
    });
  }
}

export function createUdemyAdapter(options) {
  return new UdemyAdapter(options);
}
