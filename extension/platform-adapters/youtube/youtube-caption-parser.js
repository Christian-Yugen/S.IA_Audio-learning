(() => {
  'use strict';

  const MAX_CUES = 10000;

  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function validCue(cue) {
    return cue
      && normalizeText(cue.text)
      && Number.isFinite(Number(cue.startTime))
      && Number.isFinite(Number(cue.endTime))
      && Number(cue.startTime) >= 0
      && Number(cue.endTime) > Number(cue.startTime);
  }

  function normalizeCue(cue, index = 0) {
    if (!validCue(cue)) return null;
    return {
      text: normalizeText(cue.text),
      startTime: Number(cue.startTime),
      endTime: Number(cue.endTime),
      sequenceId: String(cue.sequenceId || index),
    };
  }

  function parseJson3(value) {
    const raw = String(value || '').replace(/^\uFEFF/, '').replace(/^\)\]\}'\s*/, '');
    const parsed = typeof value === 'string' ? JSON.parse(raw) : value;
    const events = Array.isArray(parsed?.events) ? parsed.events : [];
    const cues = [];
    for (const [index, event] of events.entries()) {
      const startTime = Number(event?.tStartMs) / 1000;
      const duration = Number(event?.dDurationMs) / 1000;
      const text = Array.isArray(event?.segs)
        ? event.segs.map(segment => segment?.utf8 || '').join('')
        : String(event?.text || '');
      const cue = normalizeCue({ text, startTime, endTime: startTime + duration }, index);
      if (cue) cues.push(cue);
      if (cues.length >= MAX_CUES) break;
    }
    return cues;
  }

  function decodeXmlEntities(value) {
    const entities = {
      amp: '&',
      apos: "'",
      gt: '>',
      lt: '<',
      nbsp: ' ',
      quot: '"',
    };
    return String(value || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (full, entity) => {
      const normalized = String(entity).toLowerCase();
      if (normalized.startsWith('#x')) {
        const codePoint = Number.parseInt(normalized.slice(2), 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
      }
      if (normalized.startsWith('#')) {
        const codePoint = Number.parseInt(normalized.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
      }
      return entities[normalized] ?? full;
    });
  }

  function xmlAttribute(attributes, name) {
    const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'iu');
    return String(attributes || '').match(pattern)?.[1] || '';
  }

  function textFromXmlMarkup(value) {
    return decodeXmlEntities(
      String(value || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu, '$1')
        .replace(/<br\s*\/?>/giu, ' ')
        .replace(/<[^>]*>/gu, ' ')
    );
  }

  function parseXmlFallback(value) {
    const source = String(value || '');
    const cues = [];
    const cuePattern = /<(text|p)\b([^>]*)>([\s\S]*?)<\/\1\s*>/giu;
    for (const match of source.matchAll(cuePattern)) {
      const attributes = match[2] || '';
      const startRaw = xmlAttribute(attributes, 'start') || xmlAttribute(attributes, 't');
      const durationRaw = xmlAttribute(attributes, 'dur') || xmlAttribute(attributes, 'd');
      const start = Number(startRaw);
      const duration = Number(durationRaw);
      const startTime = start > 100 ? start / 1000 : start;
      const durationSeconds = duration > 100 ? duration / 1000 : duration;
      const cue = normalizeCue({
        text: textFromXmlMarkup(match[3]),
        startTime,
        endTime: startTime + durationSeconds,
      }, cues.length);
      if (cue) cues.push(cue);
      if (cues.length >= MAX_CUES) break;
    }
    return cues;
  }

  function parseXml(value) {
    try {
      if (typeof DOMParser === 'function') {
        const xml = new DOMParser().parseFromString(String(value || ''), 'text/xml');
        const nodes = Array.from(xml.querySelectorAll('text, p'));
        const cues = nodes.slice(0, MAX_CUES).map((node, index) => {
          const startRaw = node.getAttribute('start') || node.getAttribute('t');
          const durationRaw = node.getAttribute('dur') || node.getAttribute('d');
          const start = Number(startRaw);
          const duration = Number(durationRaw);
          const startTime = start > 100 ? start / 1000 : start;
          const durationSeconds = duration > 100 ? duration / 1000 : duration;
          return normalizeCue({
            text: node.textContent || '',
            startTime,
            endTime: startTime + durationSeconds,
          }, index);
        }).filter(Boolean);
        if (cues.length) return cues;
      }
    } catch {
      // YouTube pode bloquear parseFromString com Trusted Types; use o fallback abaixo.
    }
    return parseXmlFallback(value);
  }

  function parseTimestamp(value) {
    const parts = String(value || '').replace(',', '.').split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }

  function parseVtt(value) {
    const lines = String(value || '').replace(/\r/g, '').split('\n');
    const cues = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].includes('-->')) continue;
      const [startRaw, endRaw] = lines[index].split('-->').map(part => part.trim().split(/\s+/)[0]);
      const startTime = parseTimestamp(startRaw);
      const endTime = parseTimestamp(endRaw);
      const textLines = [];
      for (index += 1; index < lines.length && lines[index].trim(); index += 1) textLines.push(lines[index]);
      const cue = normalizeCue({ text: textLines.join(' '), startTime, endTime }, cues.length);
      if (cue) cues.push(cue);
      if (cues.length >= MAX_CUES) break;
    }
    return cues;
  }

  function parse(body) {
    const text = String(body || '');
    try {
      const json = parseJson3(text);
      if (json.length) return json;
    } catch {
      // Try the other formats.
    }
    if (text.includes('-->')) return parseVtt(text);
    return parseXml(text);
  }

  globalThis.SiaYoutubeCaptionParser = Object.freeze({
    normalizeText,
    validCue,
    normalizeCue,
    parseJson3,
    parseXml,
    parseVtt,
    parse,
  });
})();
