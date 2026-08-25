const DEFAULTS = Object.freeze({
  stabilityMs: 420,
  maxHoldMs: 1800,
  maxGapSeconds: 0.65,
  maxCueSpanSeconds: 8,
  maxEmittedFingerprints: 80,
});

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function words(value) {
  return normalizeText(value).split(' ').filter(Boolean);
}

function isValidTiming(startTime, endTime) {
  return Number.isFinite(startTime) && Number.isFinite(endTime) && startTime >= 0 && endTime > startTime;
}

function hasSentencePunctuation(text) {
  return /[.!?…](?:[\"'”’»\)\]]*)$/.test(normalizeText(text));
}

function hasPausePunctuation(text) {
  return /[,;:]$/.test(normalizeText(text));
}

function normalizedCue(input = {}) {
  const text = normalizeText(input.text);
  const startTime = Number(input.startTime);
  const endTime = Number(input.endTime);
  if (!text || !isValidTiming(startTime, endTime)) return null;
  return Object.freeze({
    text,
    startTime,
    endTime,
    sequenceId: input.sequenceId == null ? null : String(input.sequenceId),
  });
}

function longestSuffixPrefix(left, right) {
  const leftWords = words(left);
  const rightWords = words(right);
  const limit = Math.min(leftWords.length, rightWords.length);
  for (let size = limit; size >= 1; size -= 1) {
    const suffix = leftWords.slice(-size).join(' ').toLocaleLowerCase();
    const prefix = rightWords.slice(0, size).join(' ').toLocaleLowerCase();
    if (suffix === prefix) return size;
  }
  return 0;
}

function mergeText(previousText, nextText) {
  const previous = normalizeText(previousText);
  const next = normalizeText(nextText);
  if (!previous) return next;
  if (!next || next === previous) return previous;
  if (next.startsWith(`${previous} `) || next.startsWith(previous)) return next;
  if (previous.startsWith(`${next} `) || previous.startsWith(next)) return previous;

  const overlap = longestSuffixPrefix(previous, next);
  if (overlap > 0) {
    const suffix = words(next).slice(overlap).join(' ');
    return normalizeText(`${previous} ${suffix}`);
  }
  return normalizeText(`${previous} ${next}`);
}

function likelyContinuation(previous, next, options) {
  if (!previous || !next) return false;
  const gap = next.startTime - previous.endTime;
  if (gap > options.maxGapSeconds) return false;
  if (next.startTime < previous.startTime - 0.05) return true;
  if (next.text.startsWith(previous.text) || previous.text.startsWith(next.text)) return true;
  if (longestSuffixPrefix(previous.text, next.text) > 0) return true;
  const previousSequence = Number(previous.sequenceId);
  const nextSequence = Number(next.sequenceId);
  const sequenceIsConsecutive = Number.isInteger(previousSequence)
    && Number.isInteger(nextSequence)
    && nextSequence === previousSequence + 1;
  if (sequenceIsConsecutive && !hasSentencePunctuation(previous.text)
    && (words(previous.text).length <= 3 || words(next.text).length <= 3)) return true;
  if (hasSentencePunctuation(previous.text)) return false;
  const firstWord = words(next.text)[0] || '';
  const startsUppercase = /^[A-ZÀ-ÖØ-Ý]/u.test(firstWord);
  if (startsUppercase && gap >= 0.18) return false;
  return true;
}

function fingerprint(cue) {
  return JSON.stringify([cue.text, Number(cue.startTime.toFixed(3)), Number(cue.endTime.toFixed(3)), cue.playerIdentity || null]);
}

export class YoutubeCaptionAggregator {
  constructor({ now = () => Date.now(), stabilityMs, maxHoldMs, maxGapSeconds, maxCueSpanSeconds, maxEmittedFingerprints } = {}) {
    this.now = typeof now === 'function' ? now : () => Date.now();
    this.options = Object.freeze({
      stabilityMs: Number.isFinite(Number(stabilityMs)) ? Number(stabilityMs) : DEFAULTS.stabilityMs,
      maxHoldMs: Number.isFinite(Number(maxHoldMs)) ? Number(maxHoldMs) : DEFAULTS.maxHoldMs,
      maxGapSeconds: Number.isFinite(Number(maxGapSeconds)) ? Number(maxGapSeconds) : DEFAULTS.maxGapSeconds,
      maxCueSpanSeconds: Number.isFinite(Number(maxCueSpanSeconds)) ? Number(maxCueSpanSeconds) : DEFAULTS.maxCueSpanSeconds,
      maxEmittedFingerprints: Number.isFinite(Number(maxEmittedFingerprints))
        ? Math.max(8, Number(maxEmittedFingerprints))
        : DEFAULTS.maxEmittedFingerprints,
    });
    this.playerIdentity = null;
    this.buffer = null;
    this.lastUpdateAt = 0;
    this.lastEmittedText = '';
    this.lastEmittedEndTime = 0;
    this.emittedFingerprints = [];
  }

  setPlayerIdentity(playerIdentity) {
    const previous = JSON.stringify(this.playerIdentity);
    const next = playerIdentity || null;
    this.playerIdentity = next;
    if (previous !== JSON.stringify(next)) this.reset();
  }

  reset() {
    this.buffer = null;
    this.lastUpdateAt = 0;
    this.lastEmittedText = '';
    this.lastEmittedEndTime = 0;
    this.emittedFingerprints = [];
  }

  closeBuffer() {
    if (!this.buffer) return [];
    const buffer = this.buffer;
    const cue = Object.freeze({
      text: buffer.text,
      startTime: buffer.startTime,
      endTime: buffer.endTime,
      playerIdentity: this.playerIdentity,
      sequenceId: buffer.sequenceId,
      source: 'youtube-aggregated',
      sourceConfidence: 'high',
      safeToSpeak: true,
    });
    this.buffer = null;
    const sameTemporalWindow = this.lastEmittedText
      && buffer.startTime <= this.lastEmittedEndTime + this.options.maxGapSeconds;
    const repeatedSuffix = sameTemporalWindow
      && (buffer.text === this.lastEmittedText || this.lastEmittedText.endsWith(` ${buffer.text}`));
    if (repeatedSuffix) return [];
    this.lastEmittedText = buffer.text;
    this.lastEmittedEndTime = buffer.endTime;
    const key = fingerprint(cue);
    if (this.emittedFingerprints.includes(key)) return [];
    this.emittedFingerprints.push(key);
    if (this.emittedFingerprints.length > this.options.maxEmittedFingerprints) {
      this.emittedFingerprints.splice(0, this.emittedFingerprints.length - this.options.maxEmittedFingerprints);
    }
    return [cue];
  }

  push(input, at = this.now()) {
    const cue = normalizedCue(input);
    if (!cue) return [];
    const now = Number.isFinite(Number(at)) ? Number(at) : this.now();
    const closed = [];

    if (!this.buffer) {
      let nextCue = cue;
      if (this.lastEmittedText && cue.startTime <= this.lastEmittedEndTime + this.options.maxGapSeconds) {
        if (cue.text === this.lastEmittedText || cue.text.startsWith(`${this.lastEmittedText} `)) {
          const suffix = normalizeText(cue.text.slice(this.lastEmittedText.length));
          if (!suffix) return [];
          nextCue = {
            ...cue,
            text: suffix,
            startTime: Math.max(cue.startTime, this.lastEmittedEndTime),
          };
        } else {
          const overlap = longestSuffixPrefix(this.lastEmittedText, cue.text);
          if (overlap > 0) {
            const suffix = words(cue.text).slice(overlap).join(' ');
            if (!suffix) return [];
            nextCue = {
              ...cue,
              text: suffix,
              startTime: Math.max(cue.startTime, this.lastEmittedEndTime),
            };
          }
        }
      }
      this.buffer = { ...nextCue, firstSeenAt: now };
      this.lastUpdateAt = now;
      if (hasSentencePunctuation(nextCue.text)) closed.push(...this.closeBuffer());
      return closed;
    }

    const span = Math.max(cue.endTime, this.buffer.endTime) - this.buffer.startTime;
    const continuation = likelyContinuation(this.buffer, cue, this.options);
    if (!continuation || span > this.options.maxCueSpanSeconds) {
      closed.push(...this.closeBuffer());
      this.buffer = { ...cue, firstSeenAt: now };
    } else {
      this.buffer = {
        ...this.buffer,
        text: mergeText(this.buffer.text, cue.text),
        endTime: Math.max(this.buffer.endTime, cue.endTime),
        sequenceId: cue.sequenceId || this.buffer.sequenceId,
      };
    }
    this.lastUpdateAt = now;
    if (hasSentencePunctuation(this.buffer.text)) closed.push(...this.closeBuffer());
    return closed;
  }

  flushDue(at = this.now(), force = false) {
    if (!this.buffer) return [];
    const now = Number.isFinite(Number(at)) ? Number(at) : this.now();
    const age = now - this.lastUpdateAt;
    const held = now - (this.buffer.firstSeenAt || this.lastUpdateAt);
    if (force || age >= this.options.stabilityMs || held >= this.options.maxHoldMs) {
      return this.closeBuffer();
    }
    return [];
  }

  snapshot() {
    return Object.freeze({
      playerIdentity: this.playerIdentity,
      buffer: this.buffer ? Object.freeze({ ...this.buffer }) : null,
      lastUpdateAt: this.lastUpdateAt,
      options: this.options,
      lastEmittedText: this.lastEmittedText,
      lastEmittedEndTime: this.lastEmittedEndTime,
    });
  }
}

export function createYoutubeCaptionAggregator(options) {
  return new YoutubeCaptionAggregator(options);
}

export const YOUTUBE_AGGREGATOR_DEFAULTS = DEFAULTS;
export const youtubeCaptionInternals = Object.freeze({
  normalizeText,
  normalizedCue,
  mergeText,
  hasSentencePunctuation,
  hasPausePunctuation,
  longestSuffixPrefix,
});
