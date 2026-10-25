(function initNeuroDirector(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SiaNeuroDirector = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const COGNITIVE_STATES = Object.freeze({
    VIP_FOCUS: "vip_focus",
    BALANCED_COGNITIVE: "balanced_cognitive",
    AMBIENT_RELAX: "ambient_relax",
  });

  const PRESETS = Object.freeze(Object.fromEntries(
    Object.entries(rootSettings().profiles).map(([id, sia]) => [id, Object.freeze({
      id, name: sia.name, sia,
      insight: "Posição da voz S·IA. O vídeo conserva o posicionamento original."
    })])
  ));
  function rootSettings() { return globalThis.SiaAudioSettings; }

  const CRITICAL_KEYWORDS = new Set([
    "definir", "definição", "conceito", "importante", "fundamental", "essencial",
    "fórmula", "atenção", "regra", "princípio", "cuidado", "lembre-se", "ou seja",
    "portanto", "chave", "conclusão", "exemplo clássico", "definition", "concept",
    "important", "formula", "crucial", "remember", "key", "principle", "rule",
    "note", "warning", "critical", "essential", "algorithm", "architecture"
  ]);

  const TRANSITION_KEYWORDS = new Set([
    "olá", "bem-vindo", "bem vindo", "vamos ver", "agora vamos", "ok", "então",
    "veja bem", "por exemplo", "outro caso", "hello", "welcome", "so now",
    "let's see", "next", "alright", "in this case", "moving on"
  ]);

  function normalizeText(text) {
    return String(text || "").trim().toLowerCase();
  }

  function calculateCoordinates(angleDeg, distanceM) {
    const rad = (Number(angleDeg) || 0) * (Math.PI / 180);
    const dist = Math.max(0.3, Math.min(2.5, Number(distanceM) || 1.0));
    const x = Number((dist * Math.sin(rad)).toFixed(2));
    const z = Number((-dist * Math.cos(rad)).toFixed(2));
    return Object.freeze({
      angle: Math.round(angleDeg),
      distance: Number(dist.toFixed(2)),
      x,
      y: 0.15,
      z,
    });
  }

  function containsPhrase(text, phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "u").test(text);
  }

  function classifyCognitiveState(text) {
    const clean = normalizeText(text);
    if (!clean) return COGNITIVE_STATES.BALANCED_COGNITIVE;

    const words = clean.split(/[\s,.;:!?()"-]+/u).filter(Boolean);
    if (words.length <= 3 && [...TRANSITION_KEYWORDS].some(phrase => containsPhrase(clean, phrase))) {
      return COGNITIVE_STATES.AMBIENT_RELAX;
    }

    let criticalMatches = 0;
    for (const keyword of CRITICAL_KEYWORDS) {
      if (containsPhrase(clean, keyword)) criticalMatches++;
    }

    const hasEmphasis = /[:!?]/.test(clean);
    const rawWords = String(text || "").split(/\s+/);
    const uppercaseCount = rawWords.filter(w => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;

    if (criticalMatches >= 1 || (hasEmphasis && words.length >= 5) || uppercaseCount >= 2) {
      return COGNITIVE_STATES.VIP_FOCUS;
    }

    if (words.length <= 4) {
      return COGNITIVE_STATES.AMBIENT_RELAX;
    }

    return COGNITIVE_STATES.BALANCED_COGNITIVE;
  }

  function getRecommendedStage(text, { activePreset = "stage", isDirectorEnabled = false } = {}) {
    const basePreset = PRESETS[globalThis.SiaAudioSettings.keyFor(activePreset)];

    if (!isDirectorEnabled) {
      return Object.freeze({
        state: COGNITIVE_STATES.BALANCED_COGNITIVE,
        isDirectorActive: false,
        presetId: basePreset.id,
        presetName: basePreset.name,
        sia: basePreset.sia,

        insight: basePreset.insight,
        durationMs: 800,
      });
    }

    const state = classifyCognitiveState(text);

    if (state === COGNITIVE_STATES.VIP_FOCUS) {
      const siaCoords = calculateCoordinates(basePreset.sia.angle * 0.5, 0.5);
      return Object.freeze({
        state,
        isDirectorActive: true,
        presetId: basePreset.id,
        presetName: basePreset.name,
        sia: Object.freeze({ ...siaCoords, volume: 1.0 }),

        insight: "Palavra-chave de destaque encontrada. Posição aproximada da voz ajustada automaticamente.",
        durationMs: 700,
      });
    }

    if (state === COGNITIVE_STATES.AMBIENT_RELAX) {
      const siaCoords = calculateCoordinates(basePreset.sia.angle, Math.min(1.3, basePreset.sia.distance * 1.3));
      return Object.freeze({
        state,
        isDirectorActive: true,
        presetId: basePreset.id,
        presetName: basePreset.name,
        sia: Object.freeze({ ...siaCoords, volume: 0.95 }),

        insight: "Frase curta ou de transição encontrada pelas regras. Distância da voz ajustada.",
        durationMs: 900,
      });
    }

    return Object.freeze({
      state,
      isDirectorActive: true,
      presetId: basePreset.id,
      presetName: basePreset.name,
      sia: basePreset.sia,

      insight: basePreset.insight,
      durationMs: 800,
    });
  }

  function interpolateValue(start, end, factor) {
    const t = Math.max(0, Math.min(1, factor));
    const smoothT = t * t * (3 - 2 * t);
    return Number((start + (end - start) * smoothT).toFixed(2));
  }

  return Object.freeze({
    COGNITIVE_STATES,
    PRESETS,
    classifyCognitiveState,
    calculateCoordinates,
    getRecommendedStage,
    interpolateValue,
  });
});
