import test from "node:test";
import assert from "node:assert/strict";
import "../../audio-settings.js";
import "../../learning/neuro-director.js";

const director = globalThis.SiaNeuroDirector;

test("SiaNeuroDirector expõe o catálogo compartilhado de posições da voz", () => {
  assert.ok(director, "SiaNeuroDirector deve estar definido globalmente");
  assert.ok(director.PRESETS.interpreter, "Preset ONU deve existir");
  assert.ok(director.PRESETS.vip, "Preset VIP deve existir");
  assert.ok(director.PRESETS.colleague, "Preset Colega de Bancada deve existir");
  assert.ok(director.PRESETS.right, "Preset Bilingual Shadowing deve existir");

  assert.equal(director.PRESETS.interpreter.sia.angle, 25);

  assert.equal(director.PRESETS.vip.sia.angle, 0);
  assert.equal(director.PRESETS.vip.sia.distance, 0.5);

  assert.equal(director.PRESETS.right.sia.angle, 90);
});

test("SiaNeuroDirector classifica frases por regras de palavras-chave das legendas", () => {
  // Frase crítica com palavras-chave de alerta/conceito
  const stateCritical = director.classifyCognitiveState("Atenção crucial: essa definição do conceito é muito importante e fundamental!");
  assert.equal(stateCritical, director.COGNITIVE_STATES.VIP_FOCUS);

  // Frase neutra intermediária
  const stateNormal = director.classifyCognitiveState("Nós analisamos os dados anteriores nesta aula detalhadamente.");
  assert.equal(stateNormal, director.COGNITIVE_STATES.BALANCED_COGNITIVE);

  // Frase de transição/relaxamento
  const stateRelax = director.classifyCognitiveState("Olá, bem-vindo.");
  assert.equal(stateRelax, director.COGNITIVE_STATES.AMBIENT_RELAX);
});

test("SiaNeuroDirector calcula palco 3D adaptativo com explicação do insight", () => {
  const stageVip = director.getRecommendedStage(
    "Importante: nunca execute este comando sem antes verificar a regra fundamental!",
    { activePreset: "interpreter", isDirectorEnabled: true }
  );

  assert.ok(stageVip);
  assert.equal(stageVip.state, director.COGNITIVE_STATES.VIP_FOCUS);
  assert.ok(stageVip.sia);
  assert.equal(typeof stageVip.sia.angle, "number");
  assert.equal(typeof stageVip.sia.distance, "number");
  assert.ok(typeof stageVip.insight === "string" && stageVip.insight.length > 10);

  // Quando o diretor automático está desligado, respeita estritamente o preset
  const stageManual = director.getRecommendedStage(
    "Qualquer frase",
    { activePreset: "right", isDirectorEnabled: false }
  );
  assert.equal(stageManual.isDirectorActive, false);
  assert.equal(stageManual.sia.angle, 90);
});

test("SiaNeuroDirector calcula coordenadas cartesianas 3D", () => {
  const coordFront = director.calculateCoordinates(0, 1.0);
  assert.ok(Math.abs(coordFront.x - 0) < 0.001);
  assert.ok(Math.abs(coordFront.z - (-1.0)) < 0.001);

  const coordRight = director.calculateCoordinates(90, 1.0);
  assert.ok(Math.abs(coordRight.x - 1.0) < 0.001);
  assert.ok(Math.abs(coordRight.z - 0) < 0.001);

  const coordLeft = director.calculateCoordinates(-90, 1.0);
  assert.ok(Math.abs(coordLeft.x - (-1.0)) < 0.001);
  assert.ok(Math.abs(coordLeft.z - 0) < 0.001);
});

test("SiaNeuroDirector interpola curvas cúbicas de Bézier com suavidade nos extremos", () => {
  const start = 0;
  const end = 100;

  assert.equal(director.interpolateValue(start, end, 0), 0);
  assert.equal(director.interpolateValue(start, end, 1), 100);

  const mid = director.interpolateValue(start, end, 0.5);
  assert.equal(mid, 50);

  const q1 = director.interpolateValue(start, end, 0.25);
  const q3 = director.interpolateValue(start, end, 0.75);
  assert.ok(q1 > 0 && q1 < 50);
  assert.ok(q3 > 50 && q3 < 100);
});


test("expressões compostas são reconhecidas sem confundir partes de palavras", () => {
  assert.equal(director.classifyCognitiveState("Os valores são equivalentes ou seja representam a mesma medida"), director.COGNITIVE_STATES.VIP_FOCUS);
  assert.equal(director.classifyCognitiveState("O keyboard continua conectado durante todo o procedimento"), director.COGNITIVE_STATES.BALANCED_COGNITIVE);
});

test("automação é opt-in e recomenda somente posição da voz", () => {
  const stage = director.getRecommendedStage("Atenção conceito fundamental");
  assert.equal(stage.isDirectorActive, false);
  assert.equal(stage.sia.angle, 0);
  assert.equal(stage.video, undefined);
  for (const [id, preset] of Object.entries(director.PRESETS)) {
    assert.equal(preset.sia, globalThis.SiaAudioSettings.profiles[id]);
    assert.doesNotMatch(preset.insight, /70%|TDAH|retenção acelerada/);
  }
});
