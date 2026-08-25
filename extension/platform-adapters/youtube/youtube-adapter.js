import {
  ADAPTER_VERSION,
  CONFIDENCE,
  EVENTS,
  PLATFORM_ID,
  SOURCES,
  STATES,
  buildDiagnostic,
  deriveState,
  extractVideoId,
  isSamePlayer,
  isYoutubeWatchUrl,
  normalizeCue,
  normalizePlayerIdentity,
} from './youtube-adapter-contract.js';
import { createYoutubeCaptionAggregator } from './youtube-caption-aggregator.js';

const AD_SELECTORS = Object.freeze([
  '#movie_player.ad-showing',
  '.html5-video-player.ad-showing',
  '#movie_player .ytp-ad-player-overlay',
  '.ytp-ad-player-overlay',
]);

const OVERLAY_SELECTORS = Object.freeze([
  '#caption-window-1',
  '.caption-window',
  '.ytp-caption-window-container',
  '.ytp-caption-segment',
]);

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function textFromNode(node) {
  return normalizeText(node?.innerText || node?.textContent || '');
}

function validTimedCue(cue) {
  return Boolean(cue)
    && normalizeText(cue.text)
    && Number.isFinite(Number(cue.startTime))
    && Number.isFinite(Number(cue.endTime))
    && Number(cue.startTime) >= 0
    && Number(cue.endTime) > Number(cue.startTime);
}

function snapshotCue(cue) {
  if (!validTimedCue(cue)) return null;
  return {
    text: normalizeText(cue.text),
    startTime: Number(cue.startTime),
    endTime: Number(cue.endTime),
    sequenceId: cue.sequenceId ?? cue.id ?? null,
  };
}

function allTracks(video) {
  try {
    return video?.textTracks ? Array.from(video.textTracks) : [];
  } catch {
    return [];
  }
}

function allCues(track) {
  try {
    return track?.cues ? Array.from(track.cues) : [];
  } catch {
    return [];
  }
}

function activeCues(track) {
  try {
    return track?.activeCues ? Array.from(track.activeCues) : [];
  } catch {
    return [];
  }
}

function cueAtCurrentTime(track, video, tolerance = 0.28) {
  const currentTime = Number(video?.currentTime);
  if (!Number.isFinite(currentTime)) return null;
  return allCues(track).find((cue) => {
    const startTime = Number(cue?.startTime);
    const endTime = Number(cue?.endTime);
    return Number.isFinite(startTime)
      && Number.isFinite(endTime)
      && currentTime + tolerance >= startTime
      && currentTime - tolerance <= endTime;
  }) || null;
}

function advertisementShowing(documentRef) {
  return AD_SELECTORS.some(selector => {
    try { return Boolean(documentRef?.querySelector?.(selector)); } catch { return false; }
  });
}

function videoSourceKey(video) {
  const source = video?.currentSrc || video?.src || video?.getAttribute?.('src') || '';
  const duration = Number(video?.duration);
  return `${String(source)}|${Number.isFinite(duration) ? duration.toFixed(3) : 'unknown'}`;
}

function overlayText(documentRef) {
  for (const selector of OVERLAY_SELECTORS) {
    const nodes = typeof documentRef?.querySelectorAll === 'function'
      ? Array.from(documentRef.querySelectorAll(selector))
      : [];
    const text = normalizeText(nodes.map(textFromNode).filter(Boolean).join(' '));
    if (text) return { selector, text };
  }
  return null;
}

function trackLabel(track) {
  return [track?.kind, track?.label, track?.language, track?.id]
    .map(value => String(value || '').trim().toLocaleLowerCase())
    .filter(Boolean)
    .join(' ');
}

function captionTracks(video) {
  return allTracks(video).filter((track) => {
    const kind = String(track?.kind || '').trim().toLocaleLowerCase();
    if (kind && !/subtitles|captions/iu.test(kind)) return false;
    const label = trackLabel(track);
    return !label || /subtitles|captions|subtitle|caption|asr|english|portugu.s|\ben\b|\bpt\b|\bpor\b/iu.test(label);
  });
}

function prepareCaptionTracks(video) {
  for (const track of captionTracks(video)) {
    try {
      if (track.mode === 'disabled') track.mode = 'hidden';
    } catch {
      // O player pode controlar o modo da faixa; o polling continua seguro.
    }
  }
}

function temporalCueKey(cue) {
  return `${cue.startTime.toFixed(3)}|${cue.endTime.toFixed(3)}|${cue.text}`;
}

export class YoutubeAdapter {
  constructor({ documentRef, locationRef, windowRef, emit, now = () => Date.now() } = {}) {
    this.documentRef = documentRef || globalThis.document;
    this.locationRef = locationRef || globalThis.location;
    this.windowRef = windowRef || globalThis.window;
    this.emit = typeof emit === 'function' ? emit : () => {};
    this.now = typeof now === 'function' ? now : () => Date.now();
    this.state = STATES.IDLE;
    this.started = false;
    this.destroyed = false;
    this.video = null;
    this.videoId = null;
    this.playerIdentity = null;
    this.videoSourceKey = '';
    this.videoListeners = [];
    this.trackListeners = [];
    this.trackListListeners = [];
    this.pageObserver = null;
    this.pollHandle = null;
    this.scanHandle = null;
    this.scanScheduled = false;
    this.lastDiagnostic = null;
    this.lastDiagnosticKey = '';
    this.lastSourceKey = '';
    this.lastFallbackKey = '';
    this.lastTemporalKey = '';
    this.lastProbe = null;
    this.activeTemporalCount = 0;
    this.externalCues = [];
    this.externalTrackKey = '';
    this.externalSourceReady = false;
    this.aggregator = createYoutubeCaptionAggregator({ now: this.now });
  }

  currentUrl() {
    return String(this.locationRef?.href || '');
  }

  start() {
    if (this.started && !this.destroyed) return this.getDiagnostic();
    this.started = true;
    this.destroyed = false;
    if (!isYoutubeWatchUrl(this.currentUrl())) {
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
    if (this.pollHandle !== null) this.windowRef?.clearInterval?.(this.pollHandle);
    if (this.scanHandle !== null) this.windowRef?.clearTimeout?.(this.scanHandle);
    this.pollHandle = null;
    this.scanHandle = null;
    this.video = null;
    this.videoId = null;
    this.playerIdentity = null;
    this.videoSourceKey = '';
    this.externalCues = [];
    this.externalTrackKey = '';
    this.externalSourceReady = false;
    this.aggregator.reset();
    this.started = false;
    this.destroyed = true;
    this.emit({ type: EVENTS.PLATFORM_LEFT, platformId: PLATFORM_ID, adapterVersion: ADAPTER_VERSION });
  }

  installPageObserver() {
    const Observer = this.windowRef?.MutationObserver || globalThis.MutationObserver;
    if (!Observer || !this.documentRef?.documentElement) return;
    this.pageObserver?.disconnect?.();
    this.pageObserver = new Observer(() => this.scheduleScan());
    this.pageObserver.observe(this.documentRef.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
      attributeFilter: ['class', 'src', 'aria-live', 'aria-hidden'],
    });
  }

  installPolling() {
    if (this.pollHandle !== null || !this.windowRef?.setInterval) return;
    this.pollHandle = this.windowRef.setInterval(() => this.scan(), 120);
  }

  scheduleScan() {
    if (this.scanScheduled || this.destroyed) return;
    this.scanScheduled = true;
    const run = () => {
      this.scanScheduled = false;
      this.scanHandle = null;
      this.scan();
    };
    if (typeof this.windowRef?.setTimeout === 'function') this.scanHandle = this.windowRef.setTimeout(run, 0);
    else run();
  }

  inspectVideo() {
    const selectors = [
      '#movie_player video.html5-main-video',
      '#movie_player video',
      'video.html5-main-video',
      'video',
    ];
    const probe = {
      documentVideos: 0,
      iframeCount: 0,
      matchedSelector: null,
      textTrackCount: 0,
      overlaySelector: null,
      overlayText: '',
      videoId: extractVideoId(this.currentUrl()),
      searchScope: 'document',
      adShowing: advertisementShowing(this.documentRef),
    };
    try {
      probe.documentVideos = this.documentRef?.querySelectorAll?.('video')?.length || 0;
      probe.iframeCount = this.documentRef?.querySelectorAll?.('iframe')?.length || 0;
    } catch {
      // Preserve the diagnostic probe even when YouTube is tearing down the player.
    }
    const overlay = overlayText(this.documentRef);
    if (overlay) {
      probe.overlaySelector = overlay.selector;
      probe.overlayText = overlay.text;
    }
    for (const selector of selectors) {
      try {
        const video = this.documentRef?.querySelector?.(selector) || null;
        if (video) {
          probe.matchedSelector = selector;
          probe.textTrackCount = allTracks(video).length;
          return { video, probe };
        }
      } catch {
        // Continue probing selectors.
      }
    }
    return { video: null, probe };
  }

  removeVideoListeners() {
    for (const { target, name, listener } of this.videoListeners) target.removeEventListener?.(name, listener);
    this.videoListeners = [];
  }

  removeTrackListeners() {
    for (const { target, name, listener } of this.trackListeners) target.removeEventListener?.(name, listener);
    for (const { target, name, listener } of this.trackListListeners) target.removeEventListener?.(name, listener);
    this.trackListeners = [];
    this.trackListListeners = [];
  }

  installVideoListeners(video) {
    this.removeVideoListeners();
    if (!video?.addEventListener) return;
    for (const name of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'emptied', 'ended', 'ratechange']) {
      const listener = () => {
        if (name === 'pause' || name === 'emptied' || name === 'ended') this.aggregator.reset();
        this.scheduleScan();
      };
      video.addEventListener(name, listener, { passive: true });
      this.videoListeners.push({ target: video, name, listener });
    }
  }

  installTrackListeners(video) {
    const tracks = captionTracks(video).filter(track => track?.addEventListener);
    const list = video?.textTracks;
    const sameTracks = tracks.length === this.trackListeners.length
      && tracks.every(track => this.trackListeners.some(item => item.target === track))
      && this.trackListListeners[0]?.target === list;
    if (sameTracks) return;
    this.removeTrackListeners();
    for (const track of tracks) {
      const listener = () => this.scheduleScan();
      track.addEventListener('cuechange', listener, { passive: true });
      this.trackListeners.push({ target: track, name: 'cuechange', listener });
    }
    if (list?.addEventListener) {
      for (const name of ['addtrack', 'removetrack', 'change']) {
        const listener = () => this.scheduleScan();
        list.addEventListener(name, listener, { passive: true });
        this.trackListListeners.push({ target: list, name, listener });
      }
    }
  }

  reconcileVideo(video) {
    const nextVideoId = extractVideoId(this.currentUrl());
    const nextIdentity = normalizePlayerIdentity(video, nextVideoId);
    const nextSourceKey = videoSourceKey(video);
    if (this.video === video && isSamePlayer(this.playerIdentity, nextIdentity) && this.videoSourceKey === nextSourceKey) {
      this.installTrackListeners(video);
      return;
    }
    this.removeVideoListeners();
    this.removeTrackListeners();
    this.aggregator.setPlayerIdentity(nextIdentity);
    this.video = video || null;
    this.videoId = nextVideoId;
    this.playerIdentity = nextIdentity;
    this.videoSourceKey = nextSourceKey;
    this.externalCues = [];
    this.externalTrackKey = '';
    this.externalSourceReady = false;
    this.lastTemporalKey = '';
    this.lastSourceKey = '';
    this.lastFallbackKey = '';
    this.installVideoListeners(video);
    this.installTrackListeners(video);
    if (video) this.emit({
      type: EVENTS.PLAYER_FOUND,
      platformId: PLATFORM_ID,
      adapterVersion: ADAPTER_VERSION,
      playerIdentity: nextIdentity,
    });
  }

  readTemporalCues(video) {
    const result = [];
    const seen = new Set();
    prepareCaptionTracks(video);
    for (const track of captionTracks(video)) {
      const active = activeCues(track);
      const candidates = active.length ? active : [cueAtCurrentTime(track, video)].filter(Boolean);
      for (const candidate of candidates) {
        const cue = snapshotCue(candidate);
        if (!cue) continue;
        const key = temporalCueKey(cue);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(cue);
      }
    }
    result.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
    return result;
  }

  setExternalTimedCues({ videoId, trackKey = '', cues = [] } = {}) {
    const normalizedVideoId = String(videoId || '').trim();
    if (normalizedVideoId && this.videoId && normalizedVideoId !== this.videoId) return false;
    const normalized = Array.isArray(cues)
      ? cues.map(snapshotCue).filter(Boolean).sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime)
      : [];
    if (!normalized.length) return false;
    const nextTrackKey = String(trackKey || normalizedVideoId || '').trim();
    const trackChanged = !this.externalSourceReady || nextTrackKey !== this.externalTrackKey;
    this.externalCues = normalized;
    this.externalTrackKey = nextTrackKey;
    this.externalSourceReady = true;
    if (trackChanged) this.aggregator.reset();
    this.scheduleScan();
    return true;
  }

  readExternalCues(video) {
    if (!this.externalSourceReady || !this.externalCues.length) return [];
    const currentTime = Number(video?.currentTime);
    if (!Number.isFinite(currentTime)) return [];
    return this.externalCues.filter(cue => currentTime + 0.28 >= cue.startTime && currentTime - 0.28 <= cue.endTime);
  }

  readOverlayFallback() {
    const overlay = overlayText(this.documentRef);
    if (!overlay) return null;
    return normalizeCue({
      text: overlay.text,
      startTime: null,
      endTime: null,
      source: SOURCES.OVERLAY,
      sourceConfidence: CONFIDENCE.LOW,
      playerIdentity: this.playerIdentity,
    });
  }

  emitAggregatedCue(cue, video) {
    if (!cue || !video || video.paused || video.ended) return;
    const currentTime = Number(video.currentTime);
    if (!Number.isFinite(currentTime)) return;
    if (currentTime + 0.45 < cue.startTime || currentTime - 0.65 > cue.endTime) return;
    const normalized = normalizeCue({
      ...cue,
      source: SOURCES.AGGREGATED,
      sourceConfidence: CONFIDENCE.HIGH,
      playerIdentity: this.playerIdentity,
    });
    if (!normalized.safeToSpeak) return;
    this.emit({ type: EVENTS.CAPTION_CHANGED, platformId: PLATFORM_ID, adapterVersion: ADAPTER_VERSION, cue: normalized, state: STATES.PRIMARY_READY });
  }

  scan() {
    if (this.destroyed) return this.getDiagnostic();
    if (!isYoutubeWatchUrl(this.currentUrl())) {
      this.state = STATES.IDLE;
      return this.publishDiagnostic({ playerFound: false, source: SOURCES.NONE, confidence: CONFIDENCE.UNKNOWN, reason: 'url-not-compatible' });
    }

    const videoResult = this.inspectVideo();
    this.lastProbe = videoResult.probe;
    this.reconcileVideo(videoResult.video);
    const video = videoResult.video;
    if (!video) {
      this.state = STATES.PLATFORM_DETECTED;
      return this.publishDiagnostic({ playerFound: false, source: SOURCES.NONE, confidence: CONFIDENCE.UNKNOWN, reason: 'player-not-found', probe: this.lastProbe });
    }
    if (this.lastProbe?.adShowing || advertisementShowing(this.documentRef)) {
      this.aggregator.reset();
      this.activeTemporalCount = 0;
      this.lastTemporalKey = '';
      this.state = STATES.WAITING_FOR_CAPTIONS;
      return this.publishDiagnostic({
        playerFound: true,
        source: SOURCES.NONE,
        confidence: CONFIDENCE.UNKNOWN,
        reason: 'youtube-ad-showing',
        probe: this.lastProbe,
      });
    }

    const nativeTemporalCues = this.readTemporalCues(video);
    const externalTemporalCues = nativeTemporalCues.length ? [] : this.readExternalCues(video);
    const temporalCues = nativeTemporalCues.length ? nativeTemporalCues : externalTemporalCues;
    const temporalSource = nativeTemporalCues.length ? SOURCES.TEXT_TRACK : (externalTemporalCues.length ? SOURCES.AGGREGATED : SOURCES.NONE);
    this.activeTemporalCount = temporalCues.length;
    let emitted = [];
    for (const cue of temporalCues) emitted = emitted.concat(this.aggregator.push(cue, this.now()));
    emitted = emitted.concat(this.aggregator.flushDue(this.now(), false));
    for (const cue of emitted) this.emitAggregatedCue(cue, video);

    const fallbackCue = temporalCues.length ? null : this.readOverlayFallback();
    const source = temporalCues.length ? temporalSource : (fallbackCue ? SOURCES.OVERLAY : SOURCES.NONE);
    const confidence = temporalCues.length ? CONFIDENCE.HIGH : (fallbackCue ? CONFIDENCE.LOW : CONFIDENCE.UNKNOWN);
    const state = deriveState({
      playerFound: true,
      source,
      confidence,
      hasTemporalCue: temporalCues.length > 0,
    });
    this.state = state;

    const sourceKey = JSON.stringify({ source, confidence, state, playerIdentity: this.playerIdentity });
    if (source !== SOURCES.NONE && sourceKey !== this.lastSourceKey) {
      this.lastSourceKey = sourceKey;
      this.emit({
        type: EVENTS.CAPTION_SOURCE_READY,
        platformId: PLATFORM_ID,
        adapterVersion: ADAPTER_VERSION,
        source,
        confidence,
        state,
        safeToSpeak: source !== SOURCES.OVERLAY,
      });
    }
    if (fallbackCue) {
      const fallbackKey = JSON.stringify({ source, text: fallbackCue.text, playerIdentity: this.playerIdentity });
      if (fallbackKey !== this.lastFallbackKey) {
        this.lastFallbackKey = fallbackKey;
        this.emit({ type: EVENTS.ADAPTER_FALLBACK, platformId: PLATFORM_ID, adapterVersion: ADAPTER_VERSION, source, confidence, state, safeToSpeak: false });
      }
    }

    const reason = temporalCues.length
      ? (nativeTemporalCues.length ? 'youtube-texttrack-temporal-cues' : 'youtube-timedtext-aggregated-cues')
      : (fallbackCue ? 'youtube-overlay-without-confirmed-timing' : 'caption-source-unavailable');
    return this.publishDiagnostic({
      playerFound: true,
      source,
      confidence,
      reason,
      cue: temporalCues[0] || fallbackCue,
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
    this.lastDiagnostic = diagnostic;
    const key = JSON.stringify(diagnostic);
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

export function createYoutubeAdapter(options) {
  return new YoutubeAdapter(options);
}
