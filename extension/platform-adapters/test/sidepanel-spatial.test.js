import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sidepanelSource = fs.readFileSync(path.join(extensionRoot, "sidepanel.js"), "utf8");
const sidepanelHtml = fs.readFileSync(path.join(extensionRoot, "sidepanel.html"), "utf8");

test("sidepanel.html contém todos os elementos visuais do Palco Sonoro 3D (dearVR PRO Style)", () => {
  assert.match(sidepanelHtml, /id="spatial-card"/);
  assert.match(sidepanelHtml, /id="spatial-radar"/);
  assert.match(sidepanelHtml, /id="spatial-puck"/);
  assert.match(sidepanelHtml, /id="spatial-pos-badge"/);
  assert.match(sidepanelHtml, /id="spatial-pos-text"/);
  assert.match(sidepanelHtml, /id="spatial-angle-slider"/);
  assert.match(sidepanelHtml, /id="spatial-dist-slider"/);
  assert.match(sidepanelHtml, /id="preset-front"/);
  assert.match(sidepanelHtml, /id="preset-interpreter"/);
  assert.match(sidepanelHtml, /id="preset-side"/);
  assert.match(sidepanelHtml, /id="preset-intimate"/);
  assert.match(sidepanelHtml, /id="ducking-opt-0"/);
  assert.match(sidepanelHtml, /id="ducking-opt-15"/);
  assert.match(sidepanelHtml, /id="ducking-opt-40"/);
  assert.match(sidepanelHtml, /id="spatial-test-headphone"/);
  assert.match(sidepanelHtml, /id="check-ear-left"/);
  assert.match(sidepanelHtml, /id="check-ear-right"/);
  assert.match(sidepanelHtml, /id="calib-question-box"/);
  assert.match(sidepanelHtml, /id="btn-calib-yes"/);
  assert.match(sidepanelHtml, /id="btn-calib-no"/);
  assert.match(sidepanelHtml, /id="calib-success-box"/);
  assert.match(sidepanelHtml, /id="mono-detected-card"/);
  assert.match(sidepanelHtml, /id="btn-open-win-settings"/);
  assert.match(sidepanelHtml, /id="btn-retry-calib"/);
});

function createMockElement(id, options = {}) {
  const listeners = new Map();
  const classes = new Set(options.classes || []);
  const style = {};
  const element = {
    id,
    value: options.value || "",
    textContent: options.textContent || "",
    dataset: options.dataset || {},
    style,
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    addEventListener(name, listener) { listeners.set(name, listener); },
    dispatch(name, event = {}) {
      const fn = listeners.get(name);
      return fn ? fn(event) : undefined;
    },
    getBoundingClientRect() {
      return { width: 220, height: 220, top: 100, left: 100, right: 320, bottom: 320 };
    },
    getContext() {
      return {
        save() {}, restore() {}, scale() {}, setTransform() {},
        clearRect() {}, fillRect() {}, beginPath() {}, roundRect() {}, fill() {},
        fillStyle: "", globalAlpha: 1
      };
    },
    appendChild() {},
    append() {},
    replaceChildren() {},
    querySelector() { return null; },
    cloneNode() { return createMockElement(`${id}-clone`); }
  };
  return element;
}

function createSpatialHarness() {
  const ids = [
    "current-sentence", "replay-current", "history", "history-count", "export-saved", "clear-history",
    "history-item-template", "toggle-history-expand",
    "generate-transcript", "replay-transcript", "download-transcript", "transcript-count", "transcript-status", "transcript-output", "lesson-transcript",
    "equalizer-canvas", "equalizer-stage", "waveform-status-badge", "waveform-status-text",
    "spatial-radar", "spatial-puck", "spatial-pos-badge", "spatial-pos-text",
    "spatial-angle-slider", "spatial-dist-slider", "spatial-angle-value", "spatial-dist-value",
    "ducking-mode-status", "spatial-test-headphone", "spatial-test-status",
    "check-ear-left", "check-ear-right", "calib-quick-badge", "calib-question-box",
    "btn-calib-yes", "btn-calib-no", "calib-success-box", "btn-recalib",
    "mono-detected-card", "btn-open-win-settings", "btn-retry-calib"
  ];
  const elements = new Map(ids.map(id => [`#${id}`, createMockElement(id)]));
  elements.get("#history-item-template").content = { firstElementChild: createMockElement("history-item") };

  const presets = [
    createMockElement("preset-front", { dataset: { angle: "0", dist: "1.0" } }),
    createMockElement("preset-interpreter", { dataset: { angle: "25", dist: "1.0" } }),
    createMockElement("preset-side", { dataset: { angle: "60", dist: "1.2" } }),
    createMockElement("preset-intimate", { dataset: { angle: "15", dist: "0.6" } }),
  ];
  const duckingBtns = [
    createMockElement("ducking-opt-0", { dataset: { ducking: "0" } }),
    createMockElement("ducking-opt-15", { dataset: { ducking: "15" } }),
    createMockElement("ducking-opt-40", { dataset: { ducking: "40" } }),
  ];

  const sentMessages = [];
  const storageData = {};

  const documentRef = {
    getElementById(id) { return elements.get(`#${id}`) || null; },
    querySelectorAll(selector) {
      if (selector === ".preset-pill") return presets;
      if (selector === ".ducking-btn") return duckingBtns;
      if (selector === ".filter") return [createMockElement("filter-all", { dataset: { filter: "all" } })];
      return [];
    },
    createElement(tag) { return createMockElement(tag); }
  };

  const chromeMock = {
    tabs: {
      query: async () => [{ id: 42 }],
      sendMessage: async (tabId, msg) => {
        sentMessages.push({ tabId, msg });
        if (msg.type === "SIA_TEST_SPATIAL_AUDIO") {
          return { ok: true, angle: msg.angle, distance: msg.distance };
        }
        return { ok: true };
      },
      onCreated: { addListener: () => {}, removeListener: () => {} },
      get: () => {},
      remove: () => {},
    },
    storage: {
      local: {
        get: (keys, cb) => cb(storageData),
        set: (data) => Object.assign(storageData, data)
      }
    },
    runtime: {
      onMessage: { addListener: () => {} }
    }
  };
  const MockAudioContext = class {
    constructor() { this.sampleRate = 48000; this.destination = {}; }
    createBuffer(channels, length, sampleRate) {
      return {
        getChannelData: () => new Float32Array(length),
      };
    }
    createBufferSource() {
      return {
        connect: () => {},
        start: () => {},
        onended: null,
      };
    }
    close() {}
  };

  const contextVm = vm.createContext({
    console,
    document: documentRef,
    chrome: chromeMock,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL: () => {} },
    Blob: class {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: (fn, delay = 0) => (delay > 0 ? 1 : fn()),
    clearTimeout: () => {},
    alert: () => {},
    confirm: () => true,
    prompt: () => null,
    AudioContext: MockAudioContext,
    window: {
      AudioContext: MockAudioContext,
      open: () => {},
      location: { href: "" },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
  });

  vm.runInContext(sidepanelSource, contextVm);

  return {
    elements,
    presets,
    duckingBtns,
    sentMessages,
    storageData,
  };
}

test("sliders de ângulo e distância sincronizam coordenadas acústicas e atualizam o puck", async () => {
  const harness = createSpatialHarness();

  const angleSlider = harness.elements.get("#spatial-angle-slider");
  const distSlider = harness.elements.get("#spatial-dist-slider");
  const puck = harness.elements.get("#spatial-puck");
  const badge = harness.elements.get("#spatial-pos-text");

  angleSlider.value = "30";
  angleSlider.dispatch("input");

  assert.match(badge.textContent, /\+30° Direita · 1.0m/);
  assert.equal(harness.storageData.sia_spatial_angle, 30);
  assert.equal(harness.storageData.sia_voice_engine, "piper-local");

  distSlider.value = "1.8";
  distSlider.dispatch("input");

  assert.match(badge.textContent, /\+30° Direita · 1.8m/);
  assert.equal(harness.storageData.sia_spatial_distance, 1.8);

  await new Promise(r => setTimeout(r, 20));

  const angleUpdate = harness.sentMessages.find(m => m.msg.key === "sia_spatial_angle");
  assert.ok(angleUpdate);
  assert.equal(angleUpdate.msg.value, 30);
});

test("botões de preset definem as posições acústicas exatas e ativam a pílula correspondente", async () => {
  const harness = createSpatialHarness();

  const presetInterpreter = harness.presets[1]; // Intérprete (+25°, 1.0m)
  presetInterpreter.dispatch("click");

  const badge = harness.elements.get("#spatial-pos-text");
  assert.match(badge.textContent, /\+25° Direita · 1.0m/);
  assert.equal(harness.storageData.sia_spatial_angle, 25);
  assert.equal(harness.storageData.sia_spatial_distance, 1.0);
  assert.equal(presetInterpreter.classList.contains("active"), true);

  const presetFront = harness.presets[0]; // Frente (0°, 1.0m)
  presetFront.dispatch("click");
  assert.match(badge.textContent, /Frente · 1.0m/);
  assert.equal(harness.storageData.sia_spatial_angle, 0);
  assert.equal(presetFront.classList.contains("active"), true);
});

test("seletor de ducking ajusta convivência com o vídeo e salva nível", async () => {
  const harness = createSpatialHarness();

  const duckingSuave = harness.duckingBtns[1]; // 15% vídeo
  duckingSuave.dispatch("click");

  const status = harness.elements.get("#ducking-mode-status");
  assert.match(status.textContent, /15% vídeo/);
  assert.equal(harness.storageData.sia_ducking_level, 15);
  assert.equal(duckingSuave.classList.contains("active"), true);

  const duckingBilingue = harness.duckingBtns[2]; // 40% vídeo
  duckingBilingue.dispatch("click");
  assert.match(status.textContent, /Bilíngue \(40% vídeo/);
  assert.equal(harness.storageData.sia_ducking_level, 40);
  assert.equal(duckingBilingue.classList.contains("active"), true);
});

test("botão de teste no fone de ouvido envia SIA_TEST_SPATIAL_AUDIO e exibe confirmação", async () => {
  const harness = createSpatialHarness();

  const testBtn = harness.elements.get("#spatial-test-headphone");
  const testStatus = harness.elements.get("#spatial-test-status");

  await testBtn.dispatch("click");

  const testMsg = harness.sentMessages.find(m => m.msg.type === "SIA_TEST_SPATIAL_AUDIO");
  assert.ok(testMsg);
  assert.equal(testMsg.msg.angle, 0);
  assert.equal(testMsg.msg.distance, 1.0);
  assert.match(testStatus.textContent, /✓ Posição confirmada no fone de ouvido!/);
});

test("fluxo interativo de calibração: resposta 'Sim, ouvi separado' confirma estéreo e persiste sia_stereo_calibrated", () => {
  const harness = createSpatialHarness();

  const btnYes = harness.elements.get("#btn-calib-yes");
  const questionBox = harness.elements.get("#calib-question-box");
  const successBox = harness.elements.get("#calib-success-box");
  const badge = harness.elements.get("#calib-quick-badge");

  btnYes.dispatch("click");

  assert.equal(harness.storageData.sia_stereo_calibrated, true);
  assert.equal(questionBox.style.display, "none");
  assert.equal(successBox.style.display, "flex");
  assert.equal(badge.textContent, "Calibrado ✓");
  assert.equal(badge.classList.contains("calibrated"), true);
});

test("fluxo interativo de calibração: resposta 'Não, ouvi nos dois' exibe atalho de áudio mono e permite retentar", () => {
  const harness = createSpatialHarness();

  const btnNo = harness.elements.get("#btn-calib-no");
  const questionBox = harness.elements.get("#calib-question-box");
  const monoCard = harness.elements.get("#mono-detected-card");
  const badge = harness.elements.get("#calib-quick-badge");
  const retryBtn = harness.elements.get("#btn-retry-calib");

  btnNo.dispatch("click");

  assert.equal(harness.storageData.sia_stereo_calibrated, false);
  assert.equal(questionBox.style.display, "none");
  assert.equal(monoCard.style.display, "grid");
  assert.equal(badge.textContent, "Mono detectado ⚠️");

  retryBtn.dispatch("click");
  assert.equal(questionBox.style.display, "grid");
  assert.equal(monoCard.style.display, "none");
  assert.equal(badge.textContent, "Clique para testar");
});
