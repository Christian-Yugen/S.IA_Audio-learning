(function initLearningEngine(root, factory) {
  const api = factory();
  root.SiaLearningEngine = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const TYPES = Object.freeze({
    IMPORTANT: "important",
    NOT_UNDERSTOOD: "not-understood",
    EXAMPLE: "example",
    APPLY: "apply",
    CONCEPT: "concept",
  });

  const RATINGS = Object.freeze({
    REMEMBERED: "remembered",
    PARTIAL: "partial",
    FORGOT: "forgot",
  });

  const VALID_TYPES = new Set(Object.values(TYPES));
  const VALID_RATINGS = new Set(Object.values(RATINGS));
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/gu, " ").trim();
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function makeId(prefix, now = Date.now()) {
    return `${prefix}-${Math.trunc(finiteNumber(now, Date.now()))}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function safeType(type) {
    return VALID_TYPES.has(type) ? type : TYPES.IMPORTANT;
  }

  function safeRating(rating) {
    return VALID_RATINGS.has(rating) ? rating : RATINGS.PARTIAL;
  }

  function questionForType(type) {
    switch (safeType(type)) {
      case TYPES.NOT_UNDERSTOOD:
        return "O que ainda não está claro neste trecho?";
      case TYPES.EXAMPLE:
        return "Que problema este exemplo resolve?";
      case TYPES.APPLY:
        return "Como você usaria esta ideia em outro caso?";
      case TYPES.CONCEPT:
        return "Explique este conceito com suas próprias palavras.";
      case TYPES.IMPORTANT:
      default:
        return "Qual é a ideia principal deste trecho?";
    }
  }

  function createBookmark({
    cue = {},
    platformId = "",
    videoId = "",
    url = "",
    title = "",
    course = "",
    type = TYPES.IMPORTANT,
    note = "",
    now = Date.now(),
    id = "",
  } = {}) {
    const start = finiteNumber(cue.startTime ?? cue.inicio, 0);
    const endCandidate = finiteNumber(cue.endTime ?? cue.fim, start);
    const end = endCandidate > start ? endCandidate : start;
    const text = normalizeText(cue.text ?? cue.texto);
    if (!text || end <= start) return null;
    const timestamp = Math.trunc(finiteNumber(now, Date.now()));
    return Object.freeze({
      id: String(id || makeId("mark", timestamp)),
      platformId: String(platformId || cue.platformId || "").trim(),
      videoId: String(videoId || cue.videoId || "").trim(),
      url: String(url || "").trim(),
      title: String(title || "").trim(),
      course: String(course || "").trim(),
      texto: text,
      inicio: start,
      fim: end,
      tipo: safeType(type),
      nota: normalizeText(note),
      criadoEm: timestamp,
      atualizadoEm: timestamp,
    });
  }

  function createRecallCard(bookmark, { now = Date.now(), id = "" } = {}) {
    if (!bookmark?.id || !normalizeText(bookmark.texto)) return null;
    const timestamp = Math.trunc(finiteNumber(now, Date.now()));
    return Object.freeze({
      id: String(id || makeId("card", timestamp)),
      bookmarkId: String(bookmark.id),
      platformId: String(bookmark.platformId || ""),
      videoId: String(bookmark.videoId || ""),
      url: String(bookmark.url || ""),
      title: String(bookmark.title || ""),
      texto: normalizeText(bookmark.texto),
      inicio: finiteNumber(bookmark.inicio, 0),
      fim: finiteNumber(bookmark.fim, 0),
      tipo: safeType(bookmark.tipo),
      pergunta: questionForType(bookmark.tipo),
      nota: normalizeText(bookmark.nota),
      criadoEm: timestamp,
      atualizadoEm: timestamp,
      proximaRevisaoEm: timestamp,
      ultimaRevisaoEm: 0,
      ultimaAvaliacao: "",
      intervaloDias: 0,
      facilidade: 2.5,
      repeticoes: 0,
      lapsos: 0,
      revisoes: 0,
    });
  }

  function addDays(timestamp, days) {
    return Math.trunc(timestamp + Math.max(1, days) * MS_PER_DAY);
  }

  function reviewCard(card, rating, { now = Date.now() } = {}) {
    if (!card?.id) return null;
    const safe = safeRating(rating);
    const timestamp = Math.trunc(finiteNumber(now, Date.now()));
    const previousInterval = Math.max(0, finiteNumber(card.intervaloDias, 0));
    const previousEase = Math.min(3, Math.max(1.3, finiteNumber(card.facilidade, 2.5)));
    let intervalDays;
    let repetitions = Math.max(0, Math.trunc(finiteNumber(card.repeticoes, 0)));
    let lapses = Math.max(0, Math.trunc(finiteNumber(card.lapsos, 0)));
    let ease = previousEase;

    if (safe === RATINGS.REMEMBERED) {
      repetitions += 1;
      intervalDays = repetitions === 1
        ? 1
        : repetitions === 2
          ? 3
          : Math.max(7, Math.round(Math.max(3, previousInterval) * ease));
      ease = Math.min(3, previousEase + 0.05);
    } else if (safe === RATINGS.PARTIAL) {
      intervalDays = Math.max(1, Math.round(Math.max(1, previousInterval) * 1.5));
      ease = Math.max(1.7, previousEase - 0.15);
    } else {
      intervalDays = 1;
      repetitions = 0;
      lapses += 1;
      ease = Math.max(1.3, previousEase - 0.25);
    }

    return Object.freeze({
      ...card,
      atualizadoEm: timestamp,
      proximaRevisaoEm: addDays(timestamp, intervalDays),
      ultimaRevisaoEm: timestamp,
      ultimaAvaliacao: safe,
      intervaloDias: intervalDays,
      facilidade: Number(ease.toFixed(2)),
      repeticoes: repetitions,
      lapsos: lapses,
      revisoes: Math.max(0, Math.trunc(finiteNumber(card.revisoes, 0))) + 1,
    });
  }

  function dueCards(cards, { now = Date.now(), limit = 20 } = {}) {
    const timestamp = Math.trunc(finiteNumber(now, Date.now()));
    const max = Math.max(1, Math.trunc(finiteNumber(limit, 20)));
    return (Array.isArray(cards) ? cards : [])
      .filter(card => card && finiteNumber(card.proximaRevisaoEm, Infinity) <= timestamp)
      .sort((a, b) => finiteNumber(a.proximaRevisaoEm, 0) - finiteNumber(b.proximaRevisaoEm, 0))
      .slice(0, max);
  }

  function progress(cards, { now = Date.now() } = {}) {
    const list = Array.isArray(cards) ? cards.filter(Boolean) : [];
    const reviewed = list.filter(card => finiteNumber(card.revisoes, 0) > 0);
    const remembered = reviewed.filter(card => card.ultimaAvaliacao === RATINGS.REMEMBERED);
    const due = dueCards(list, { now, limit: Number.MAX_SAFE_INTEGER }).length;
    const retention = reviewed.length ? remembered.length / reviewed.length : 0;
    return Object.freeze({
      total: list.length,
      revisados: reviewed.length,
      pendentes: due,
      lembrados: remembered.length,
      lapsos: list.reduce((sum, card) => sum + Math.max(0, Math.trunc(finiteNumber(card.lapsos, 0))), 0),
      retencao: Number(retention.toFixed(3)),
    });
  }

  return Object.freeze({
    TYPES,
    RATINGS,
    normalizeText,
    questionForType,
    createBookmark,
    createRecallCard,
    reviewCard,
    dueCards,
    progress,
  });
});
