/**
 * Contrato puro do adaptador Udemy experimental.
 *
 * Este módulo não acessa DOM, áudio, Piper, speechSynthesis ou o núcleo Coursera.
 * Ele somente normaliza observações e descreve estados/diagnósticos.
 */

export const ADAPTER_VERSION = 'udemy-v0-experimental';
export const PLATFORM_ID = 'udemy';

export const STATES = Object.freeze({
  IDLE: 'IDLE',
  PLATFORM_DETECTED: 'PLATFORM_DETECTED',
  PLAYER_FOUND: 'PLAYER_FOUND',
  WAITING_FOR_CAPTIONS: 'WAITING_FOR_CAPTIONS',
  PRIMARY_READY: 'PRIMARY_READY',
  FALLBACK_PROBING: 'FALLBACK_PROBING',
  FALLBACK_READY: 'FALLBACK_READY',
  UNSAFE_TO_SPEAK: 'UNSAFE_TO_SPEAK',
  EMITTING_CUE: 'EMITTING_CUE',
  DESTROYING: 'DESTROYING',
});

export const SOURCES = Object.freeze({
  TEXT_TRACK: 'texttrack',
  SHAKA_CAPTION: 'shaka-caption',
  CAPTION_EVENT: 'caption-event',
  TRANSCRIPT: 'transcript',
  DOM_CAPTION: 'dom-caption',
  NONE: 'none',
});

export const CONFIDENCE = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  UNKNOWN: 'unknown',
});

export const EVENTS = Object.freeze({
  PLATFORM_DETECTED: 'SIA_PLATFORM_DETECTED',
  PLAYER_FOUND: 'SIA_PLAYER_FOUND',
  CAPTION_SOURCE_READY: 'SIA_CAPTION_SOURCE_READY',
  CAPTION_CHANGED: 'SIA_CAPTION_CHANGED',
  CUE_COMPLETED: 'SIA_CUE_COMPLETED',
  ADAPTER_FALLBACK: 'SIA_ADAPTER_FALLBACK',
  ADAPTER_ERROR: 'SIA_ADAPTER_ERROR',
  PLATFORM_LEFT: 'SIA_PLATFORM_LEFT',
});

const VALID_STATES = new Set(Object.values(STATES));
const VALID_SOURCES = new Set(Object.values(SOURCES));
const VALID_CONFIDENCE = new Set(Object.values(CONFIDENCE));

export function isUdemyLectureUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && parsed.hostname === 'www.udemy.com'
      && /^\/course\/[^/]+\/learn\/lecture\/[^/]+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function normalizePlayerIdentity(video) {
  if (!video) return null;
  const id = typeof video.id === 'string' ? video.id.trim() : '';
  const container = typeof video.closest === 'function'
    ? video.closest('[id^="shaka-video-container-"], [data-purpose="shaka-video-player"]')
    : null;
  const containerId = typeof container?.id === 'string' ? container.id.trim() : '';
  if (!id && !containerId) return null;
  return Object.freeze({ videoId: id || null, containerId: containerId || null });
}

export function normalizeCue({ text, startTime, endTime, source, sourceConfidence, playerIdentity }) {
  const normalizedText = String(text ?? '').replace(/\s+/g, ' ').trim();
  const start = Number(startTime);
  const end = Number(endTime);
  const validSource = VALID_SOURCES.has(source) ? source : SOURCES.NONE;
  const validConfidence = VALID_CONFIDENCE.has(sourceConfidence) ? sourceConfidence : CONFIDENCE.UNKNOWN;
  const hasTiming = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
  const hasText = normalizedText.length > 0;
  const safeToSpeak = hasText && hasTiming && validConfidence === CONFIDENCE.HIGH;

  return Object.freeze({
    platformId: PLATFORM_ID,
    adapterVersion: ADAPTER_VERSION,
    text: normalizedText,
    startTime: hasTiming ? start : null,
    endTime: hasTiming ? end : null,
    source: validSource,
    sourceConfidence: validConfidence,
    playerIdentity: playerIdentity || null,
    safeToSpeak,
  });
}

export function deriveState({ playerFound, source, confidence, hasTemporalCue, destroying = false }) {
  if (destroying) return STATES.DESTROYING;
  if (!playerFound) return STATES.PLATFORM_DETECTED;
  if (!source || source === SOURCES.NONE) return STATES.WAITING_FOR_CAPTIONS;
  if ((source === SOURCES.TEXT_TRACK || source === SOURCES.SHAKA_CAPTION) && confidence === CONFIDENCE.HIGH && hasTemporalCue) return STATES.PRIMARY_READY;
  if (confidence === CONFIDENCE.HIGH && hasTemporalCue) return STATES.FALLBACK_READY;
  if (source === SOURCES.DOM_CAPTION || source === SOURCES.TRANSCRIPT) return STATES.UNSAFE_TO_SPEAK;
  return STATES.FALLBACK_PROBING;
}

export function buildDiagnostic({ state, playerFound, source = SOURCES.NONE, confidence = CONFIDENCE.UNKNOWN, reason, playerIdentity = null, cue = null, probe = null }) {
  const safeState = VALID_STATES.has(state) ? state : STATES.UNSAFE_TO_SPEAK;
  const safeSource = VALID_SOURCES.has(source) ? source : SOURCES.NONE;
  const safeConfidence = VALID_CONFIDENCE.has(confidence) ? confidence : CONFIDENCE.UNKNOWN;
  return Object.freeze({
    platformId: PLATFORM_ID,
    adapterVersion: ADAPTER_VERSION,
    player: playerFound ? 'found' : 'missing',
    source: safeSource,
    confidence: safeConfidence,
    reason: String(reason || 'unspecified'),
    state: safeState,
    userAction: 'none',
    playerIdentity: playerIdentity || null,
    probe: probe || null,
    safeToSpeak: Boolean(cue?.safeToSpeak) && safeState !== STATES.UNSAFE_TO_SPEAK,
  });
}

export function shouldEmitCue(cue, previousCue = null) {
  if (!cue || !cue.safeToSpeak) return false;
  if (!previousCue) return true;
  return !(
    cue.text === previousCue.text
    && cue.startTime === previousCue.startTime
    && cue.endTime === previousCue.endTime
    && cue.source === previousCue.source
    && JSON.stringify(cue.playerIdentity) === JSON.stringify(previousCue.playerIdentity)
  );
}

export function isSamePlayer(a, b) {
  return Boolean(a && b && a.videoId === b.videoId && a.containerId === b.containerId);
}
