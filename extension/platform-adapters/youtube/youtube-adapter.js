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
import { createYoutubeCaptionAggregator, youtubeCaptionInternals } from './youtube-caption-aggregator.js';

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

function snapshotCue(cue, fallbackSequenceId = null) {
  if (!validTimedCue(cue)) return null;
  const sequenceId = cue.sequenceId || cue.id || fallbackSequenceId;
  return {
    text: normalizeText(cue.text),
    startTime: Number(cue.startTime),
    endTime: Number(cue.endTime),
    sequenceId,
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

function videoSourceKey(video, videoId = '') {
  // currentSrc pode mudar por adaptação de qualidade/streaming sem trocar o
  // vídeo. Usá-lo como identidade resetava a deduplicação e repetia frases.
  const stableVideoId = String(videoId || '').trim();
  if (stableVideoId) return stableVideoId;
  const elementId = String(video?.id || '').trim();
  return elementId || 'youtube-video';
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
  // Nunca altere `TextTrack.mode`: `disabled` e `hidden` são escolhas visuais
  // do usuário/player. Forçar `hidden` fazia o botão do YouTube indicar
  // “legenda oculta” e removia a legenda da tela. O timedtext externo continua
  // disponível para capturar cues temporais sem interferir na apresentação.
  return captionTracks(video);
}

function temporalCueKey(cue) {
  return `${cue.startTime.toFixed(3)}|${cue.endTime.toFixed(3)}|${cue.text}`;
}

function cueWordCount(cue) {
  return normalizeText(cue?.text).split(/\s+/u).filter(Boolean).length;
}

function selectExternalCue(cues, currentTime, tolerance = 0.28) {
  if (!Array.isArray(cues) || !Number.isFinite(currentTime)) return [];
  const exact = cues.filter(cue => currentTime >= cue.startTime && currentTime <= cue.endTime);
  const candidates = exact.length
    ? exact
    : cues.filter(cue => currentTime + tolerance >= cue.startTime && currentTime - tolerance <= cue.endTime);
  if (!candidates.length) return [];
  candidates.sort((a, b) => b.startTime - a.startTime || b.endTime - a.endTime);
  return [candidates[0]];
}

function externalCuesAreFragmented(cues) {
  if (!Array.isArray(cues) || cues.length < 2) return false;
  const sample = cues.slice(0, 160);
  const shortTextRatio = sample.filter(cue => cueWordCount(cue) <= 3).length / sample.length;
  const shortDurationRatio = sample.filter(cue => cue.endTime - cue.startTime <= 0.9).length / sample.length;
  const unfinishedRatio = sample.filter(cue => !/[.!?…]["'”’»)\]]*$/u.test(normalizeText(cue.text))).length / sample.length;
  let adjacentPairs = 0;
  let overlappingPairs = 0;
  for (let index = 1; index < sample.length; index += 1) {
    const previous = sample[index - 1];
    const current = sample[index];
    const gap = current.startTime - previous.endTime;
    if (gap <= 0.65 && gap >= -0.35) adjacentPairs += 1;
    if (current.startTime < previous.endTime || current.text.startsWith(previous.text)) overlappingPairs += 1;
  }
  const pairCount = Math.max(1, sample.length - 1);
  const adjacencyRatio = adjacentPairs / pairCount;
  const overlapRatio = overlappingPairs / pairCount;
  return shortTextRatio >= 0.65
    && shortDurationRatio >= 0.65
    && unfinishedRatio >= 0.65
    && (adjacencyRatio >= 0.35 || overlapRatio >= 0.2);
}

function sequenceContinues(previous, current) {
  const previousSequence = Number(previous?.sequenceId);
  const currentSequence = Number(current?.sequenceId);
  return Number.isInteger(previousSequence)
    && Number.isInteger(currentSequence)
    && currentSequence === previousSequence + 1;
}

function canContinueFragment(previous, current, span) {
  const gap = current.startTime - previous.endTime;
  const sequenceJoin = sequenceContinues(previous, current) && gap <= 2.5;
  return gap >= -0.35
    && (gap <= 1.1 || sequenceJoin)
    && span <= 10
    && !youtubeCaptionInternals.hasSentencePunctuation(previous.text);
}

function groupFragmentedCues(cues) {
  const groups = [];
  let group = null;
  for (const cue of cues || []) {
    if (!group) {
      group = { ...cue };
    } else {
      const gap = cue.startTime - group.endTime;
      const span = Math.max(cue.endTime, group.endTime) - group.startTime;
      const canJoin = canContinueFragment(group, cue, span);
      if (!canJoin) {
        groups.push(group);
        group = { ...cue };
      } else {
        group = {
          ...group,
          text: youtubeCaptionInternals.mergeText(group.text, cue.text),
          endTime: Math.max(group.endTime, cue.endTime),
          sequenceId: cue.sequenceId || group.sequenceId,
        };
      }
    }
    if (group && youtubeCaptionInternals.hasSentencePunctuation(group.text)) {
      groups.push(group);
      group = null;
    }
  }
  if (group) groups.push(group);
  return groups;
}

function isLikelyFragmentedNativeWindow(cues) {
  if (!Array.isArray(cues) || cues.length < 2) return false;
  const sample = cues.slice(0, 12);
  const shortRatio = sample.filter(cue => cueWordCount(cue) <= 3).length / sample.length;
  const shortDurationRatio = sample.filter(cue => cue.endTime - cue.startTime <= 1.4).length / sample.length;
  const unfinishedRatio = sample.filter(cue => !youtubeCaptionInternals.hasSentencePunctuation(cue.text)).length / sample.length;
  let adjacentPairs = 0;
  for (let index = 1; index < sample.length; index += 1) {
    const gap = sample[index].startTime - sample[index - 1].endTime;
    if ((gap <= 1.1 || (sequenceContinues(sample[index - 1], sample[index]) && gap <= 2.5)) && gap >= -0.35) adjacentPairs += 1;
  }
  return shortRatio >= 0.6
    && shortDurationRatio >= 0.6
    && unfinishedRatio >= 0.6
    && adjacentPairs / Math.max(1, sample.length - 1) >= 0.5;
}

function groupNativeFragmentedSentence(track, candidate) {
  const cues = allCues(track)
    .map((cue, index) => snapshotCue(cue, index))
    .filter(Boolean)
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  if (cues.length < 2) return null;
  const candidateKey = temporalCueKey(candidate);
  const candidateIndex = cues.findIndex(cue => temporalCueKey(cue) === candidateKey);
  if (candidateIndex < 0) return null;

  let startIndex = candidateIndex;
  while (startIndex > 0) {
    const previous = cues[startIndex - 1];
    const current = cues[startIndex];
    const gap = current.startTime - previous.endTime;
    const span = current.endTime - cues[startIndex].startTime;
    if (!canContinueFragment(previous, current, span)) break;
    if (cueWordCount(previous) > 3 && cueWordCount(current) > 3) break;
    startIndex -= 1;
  }

  let text = cues[startIndex].text;
  let endIndex = startIndex;
  for (let index = startIndex + 1; index < cues.length && index < startIndex + 12; index += 1) {
    const previous = cues[index - 1];
    const current = cues[index];
    const gap = current.startTime - previous.endTime;
    const span = current.endTime - cues[startIndex].startTime;
    if (!canContinueFragment(previous, current, span)) break;
    text = youtubeCaptionInternals.mergeText(text, current.text);
    endIndex = index;
    if (youtubeCaptionInternals.hasSentencePunctuation(text)) break;
  }

  const groupedCues = cues.slice(startIndex, endIndex + 1);
  if (endIndex <= startIndex || !youtubeCaptionInternals.hasSentencePunctuation(text)) return null;
  if (!isLikelyFragmentedNativeWindow(groupedCues)) return null;
  return {
    ...cues[startIndex],
    text,
    endTime: cues[endIndex].endTime,
    sequenceId: cues[endIndex].sequenceId || cues[startIndex].sequenceId,
  };
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
    this.lastObservedTime = null;
    this.lastProbe = null;
    this.activeTemporalCount = 0;
    this.externalCues = [];
    this.externalCueGroups = [];
    this.externalTrackKey = '';
    this.externalSourceReady = false;
    this.externalCuesAreFragmented = false;
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
    this.externalCueGroups = [];
    this.externalTrackKey = '';
    this.externalSourceReady = false;
    this.externalCuesAreFragmented = false;
    this.lastObservedTime = null;
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
        if (name === 'pause' || name === 'emptied' || name === 'ended') {
          this.aggregator.reset();
          this.lastTemporalKey = '';
        }
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
    const nextSourceKey = videoSourceKey(video, nextVideoId);
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
    this.externalCueGroups = [];
    this.externalTrackKey = '';
    this.externalSourceReady = false;
    this.externalCuesAreFragmented = false;
    this.lastTemporalKey = '';
    this.lastObservedTime = null;
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
        const groupedCue = groupNativeFragmentedSentence(track, cue) || cue;
        const key = temporalCueKey(groupedCue);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(groupedCue);
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
    this.externalCuesAreFragmented = externalCuesAreFragmented(normalized);
    this.externalCueGroups = this.externalCuesAreFragmented
      ? groupFragmentedCues(normalized)
      : normalized;
    if (trackChanged) this.aggregator.reset();
    this.scheduleScan();
    return true;
  }

  clearExternalTimedCues() {
    this.externalCues = [];
    this.externalCueGroups = [];
    this.externalSourceReady = false;
    this.externalTrackKey = '';
    this.aggregator.reset();
    this.scheduleScan();
  }

  readExternalCues(video) {
    if (!this.externalSourceReady || !this.externalCues.length) return [];
    const currentTime = Number(video?.currentTime);
    if (!Number.isFinite(currentTime)) return [];
    return selectExternalCue(this.externalCueGroups, currentTime);
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
    const key = temporalCueKey(normalized);
    if (key === this.lastTemporalKey) return;
    this.lastTemporalKey = key;
    this.emit({
      type: EVENTS.CAPTION_CHANGED,
      platformId: PLATFORM_ID,
      adapterVersion: ADAPTER_VERSION,
      cue: normalized,
      state: STATES.PRIMARY_READY,
      reason: 'youtube-temporal-cue-active',
    });
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
    const currentTime = Number(video?.currentTime);
    if (video && Number.isFinite(currentTime)) {
      if (Number.isFinite(this.lastObservedTime) && currentTime + 0.35 < this.lastObservedTime) {
        this.lastTemporalKey = '';
        this.aggregator.reset();
      }
      this.lastObservedTime = currentTime;
    }
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

    const nativeCaptionTracks = captionTracks(video);
    const nativeTemporalCues = this.readTemporalCues(video);
    const nativeTrackPresent = nativeCaptionTracks.length > 0;
    const externalTemporalCues = nativeTemporalCues.length ? [] : this.readExternalCues(video);
    const temporalCues = nativeTemporalCues.length ? nativeTemporalCues : externalTemporalCues;
    const temporalSource = nativeTemporalCues.length ? SOURCES.TEXT_TRACK : (externalTemporalCues.length ? SOURCES.AGGREGATED : SOURCES.NONE);
    this.activeTemporalCount = temporalCues.length;
    let emitted = [];
    if (nativeTemporalCues.length) {
      // A existência de um snapshot externo fragmentado não invalida a faixa
      // nativa. Preserve o buffer nativo entre polls para não reiniciar a frase
      // a cada palavra quando as duas fontes coexistem.
      for (const cue of nativeTemporalCues) emitted = emitted.concat(this.aggregator.push(cue, this.now()));
      emitted = emitted.concat(this.aggregator.flushDue(this.now(), false));
    } else if (externalTemporalCues.length) {
      if (this.externalCuesAreFragmented) {
        // O transcript completo permite reconstruir a frase antes da fala;
        // emitir o grupo uma única vez evita reinícios palavra-a-palavra.
        this.aggregator.reset();
        emitted = externalTemporalCues;
      } else {
        // O fallback Innertube entrega um transcript completo com cues temporais
        // já fechadas. Segurá-lo como microcue acrescenta atraso desnecessário;
        // esse ramo continua emitindo frases normais imediatamente.
        this.aggregator.reset();
        emitted = externalTemporalCues;
      }
    } else if (nativeTrackPresent && this.aggregator.snapshot().buffer) {
      // Uma faixa nativa palavra-a-palavra pode ter pequenos intervalos entre
      // cues. Preserve a frase parcial até a estabilidade/limite do agregador.
      emitted = this.aggregator.flushDue(this.now(), false);
    } else {
      this.aggregator.reset();
    }
    for (const cue of emitted) this.emitAggregatedCue(cue, video);

    // Se o transcript temporal já foi carregado, o overlay é apenas a camada
    // visual do player e não deve rebaixar a sessão para “timing inseguro”
    // durante o intervalo entre duas cues. Ele nunca é usado para fala.
    const fallbackCue = temporalCues.length || this.externalSourceReady ? null : this.readOverlayFallback();
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
