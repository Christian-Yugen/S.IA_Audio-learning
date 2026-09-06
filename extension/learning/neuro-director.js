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

  const PRESETS = Object.freeze({
    onu: Object.freeze({
      id: "onu",
      name: "Intérprete da ONU",
      tagline: "Separação Áurea (Recomendado)",
      sia: Object.freeze({ angle: 25, distance: 0.8, x: 0.34, y: 0.15, z: -0.72, volume: 1.0 }),
      video: Object.freeze({ angle: -25, distance: 1.5, x: -0.63, y: 0.15, z: -1.36, volume: 0.20 }),
      insight: "Separação Áurea de 50° ativa: Efeito Cocktail Party reduz a fadiga auditiva em até 70%.",
    }),
    vip: Object.freeze({
      id: "vip",
      name: "Tutor Particular VIP",
      tagline: "Foco Frontal Absoluto",
      sia: Object.freeze({ angle: 0, distance: 0.5, x: 0.0, y: 0.15, z: -0.5, volume: 1.0 }),
      video: Object.freeze({ angle: 0, distance: 2.0, x: 0.0, y: 0.15, z: -2.0, volume: 0.0 }),
      insight: "Hiper-foco frontal com vídeo mudo. Ideal para conceitos difíceis, TDAH e retenção acelerada.",
    }),
    colleague: Object.freeze({
      id: "colleague",
      name: "Colega de Bancada",
      tagline: "Mentoria Presencial",
      sia: Object.freeze({ angle: -45, distance: 0.8, x: -0.57, y: 0.15, z: -0.57, volume: 0.95 }),
      video: Object.freeze({ angle: 0, distance: 1.5, x: 0.0, y: 0.15, z: -1.5, volume: 0.25 }),
      insight: "Sensação acústica presencial: professor no palco e tutor ao seu lado esquerdo explicando o código.",
    }),
    bilingual: Object.freeze({
      id: "bilingual",
      name: "Bilingual Shadowing",
      tagline: "Isolamento Interaural L/R",
      sia: Object.freeze({ angle: 90, distance: 0.8, x: 0.8, y: 0.15, z: 0.0, volume: 1.0 }),
      video: Object.freeze({ angle: -90, distance: 1.0, x: -1.0, y: 0.15, z: 0.0, volume: 0.35 }),
      insight: "Isolamento interaural completo: áudio original no ouvido esquerdo e português no direito.",
    }),
  });

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
    const dist = Math.max(0.3, Math.min(3.0, Number(distanceM) || 1.0));
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

  function classifyCognitiveState(text) {
    const clean = normalizeText(text);
    if (!clean) return COGNITIVE_STATES.BALANCED_COGNITIVE;

    const words = clean.split(/[\s,.;:!?()"-]+/u).filter(Boolean);
    if (words.length <= 3 && words.some(w => TRANSITION_KEYWORDS.has(w))) {
      return COGNITIVE_STATES.AMBIENT_RELAX;
    }

    let criticalMatches = 0;
    for (const w of words) {
      if (CRITICAL_KEYWORDS.has(w)) criticalMatches++;
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

  function getRecommendedStage(text, { activePreset = "onu", isDirectorEnabled = true } = {}) {
    const basePreset = PRESETS[activePreset] || PRESETS.onu;

    if (!isDirectorEnabled) {
      return Object.freeze({
        state: COGNITIVE_STATES.BALANCED_COGNITIVE,
        isDirectorActive: false,
        presetId: basePreset.id,
        presetName: basePreset.name,
        sia: basePreset.sia,
        video: basePreset.video,
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
        video: Object.freeze({ ...basePreset.video, volume: 0.05, distance: Math.max(1.8, basePreset.video.distance * 1.2) }),
        insight: "IA detectou conceito crítico: Proximidade VIP ativada para retenção profunda e vídeo atenuado.",
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
        video: Object.freeze({ ...basePreset.video, volume: Math.min(0.35, basePreset.video.volume * 1.5) }),
        insight: "IA: Momento de transição/exemplo detectado. Palco ampliado para descanso e alívio mental.",
        durationMs: 900,
      });
    }

    return Object.freeze({
      state,
      isDirectorActive: true,
      presetId: basePreset.id,
      presetName: basePreset.name,
      sia: basePreset.sia,
      video: basePreset.video,
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
