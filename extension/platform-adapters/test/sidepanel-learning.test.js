import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sidepanelSource = fs.readFileSync(path.join(extensionRoot, "sidepanel.js"), "utf8");

function createElement(id, options = {}) {
  const listeners = new Map();
  const classes = new Set();
  const element = {
    id,
    width: 300,
    height: 56,
    value: options.value || "",
    textContent: options.textContent || "",
    className: options.className || "",
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    dataset: options.dataset || {},
    style: { setProperty() {} },
    attributes: new Map(),
    setAttribute(name, val) { this.attributes.set(name, String(val)); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    disabled: false,
    hidden: false,
    options: [],
    children: [],
    addEventListener(name, listener) { listeners.set(name, listener); },
    listener(name) { return listeners.get(name); },
    focus() { this.focused = true; },
    click() { this.clicked = true; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    querySelector(selector) { return this.childElements?.get(selector) || createElement(`${id}-${selector}`); },
    getBoundingClientRect() { return { width: 300, height: 56, top: 0, left: 0, right: 300, bottom: 56 }; },
    getContext(type) {
      if (type === "2d") {
        return {
          save() {},
          restore() {},
          scale() {},
          setTransform() {},
          clearRect() {},
          fillRect() {},
          beginPath() {},
          roundRect() {},
          fill() {},
          fillStyle: "",
          globalAlpha: 1,
        };
      }
      return null;
    },
  };
  return element;
}

function createHistoryItem() {
  const item = createElement("history-item");
  item.childElements = new Map([
    [".time", createElement("time")],
    ["p", createElement("sentence")],
    [".note-text", createElement("note-text")],
    [".favorite", createElement("favorite")],
    [".replay", createElement("replay")],
    [".note", createElement("note")],
  ]);
  item.cloneNode = () => createHistoryItem();
  return item;
}

function baseStudyContext(overrides = {}) {
  return {
    ok: true,
    history: [{
      id: "history-1",
      inicio: 12,
      texto: "Uma frase já lida",
      favorito: true,
      nota: "nota local",
      titulo: "Aula de teste",
      url: "https://coursera.org/learn/test/lecture/1",
    }],
    ...overrides,
  };
}

function createHarness({ context = baseStudyContext(), transcriptResponse = null, replayTranscriptResponse = null } = {}) {
  const ids = [
    "current-sentence", "replay-current", "history", "history-count", "export-saved", "clear-history",
    "history-item-template",
    "generate-transcript", "replay-transcript", "download-transcript", "transcript-count", "transcript-status", "transcript-output", "lesson-transcript",
    "equalizer-canvas", "equalizer-stage", "waveform-status-badge", "waveform-status-text",
  ];
  const elements = new Map(ids.map(id => [`#${id}`, createElement(id)]));
  elements.get("#history-item-template").content = { firstElementChild: createHistoryItem() };
  const filters = [
    createElement("filter-all", { dataset: { filter: "all" } }),
    createElement("filter-favorites", { dataset: { filter: "favorites" } }),
  ];
  filters[0].classList.add("active");
  const createdLinks = [];
  const documentRef = {
    getElementById(id) { return elements.get(`#${id}`) || null; },
    querySelectorAll(selector) {
      if (selector === ".filter") return filters;
      return [];
    },
    createElement(tag) {
      const element = createElement(tag);
      if (tag === "a") createdLinks.push(element);
      return element;
    },
  };
  const sentMessages = [];
  const intervals = [];
  const state = { context };
  const browserUrl = {
    createObjectURL() { return "blob:sia-test"; },
    revokeObjectURL() {},
  };
  const contextVm = vm.createContext({
    console,
    document: documentRef,
    URL: browserUrl,
    Blob: class Blob { constructor(parts, options) { this.parts = parts; this.options = options; state.lastBlob = this; } },
    setInterval(callback) { intervals.push(callback); return intervals.length; },
    clearInterval() {},
    requestAnimationFrame(cb) { return 1; },
    cancelAnimationFrame() {},
    alert(message) { state.alert = message; },
    confirm() { return true; },
    prompt() { return "nota editada"; },
    addEventListener() {},
    removeEventListener() {},
    Date,
  });
  contextVm.window = contextVm;
  contextVm.globalThis = contextVm;
  contextVm.chrome = {
    tabs: {
      async query() { return [{ id: 31, url: "https://coursera.org/learn/test/lecture/1" }]; },
      async sendMessage(tabId, message) {
        sentMessages.push({ tabId, message });
        if (message.type === "SIA_GET_LEARNING_CONTEXT") return state.context;
        if (message.type === "SIA_GET_LESSON_TRANSCRIPT") return transcriptResponse || {
          ok: true,
          transcricao: { texto: "Fala de teste.", trechos: [], totalFrases: 1, caracteres: 14 },
          fonte: "historico-local",
        };
        if (message.type === "SIA_REPLAY_LESSON_TRANSCRIPT") return replayTranscriptResponse || { ok: true, reason: "transcript-replay-started", inicio: 11.95, fim: 21, totalFrases: 2 };
        if (message.type === "SIA_UPDATE_HISTORY_ENTRY") {
          return { ok: true, entry: { ...state.context.history[0], favorito: message.favorite, nota: message.note } };
        }
        if (message.type === "SIA_CLEAR_HISTORY") {
          state.context = { ...state.context, history: [] };
          return { ok: true };
        }
        return { ok: true };
      },
    },
    runtime: {
      onMessage: {
        addListener(fn) { onMessageListeners.push(fn); },
      },
    },
  };
  const onMessageListeners = [];
  vm.runInContext(sidepanelSource, contextVm, { filename: "sidepanel.js" });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { elements, filters, sentMessages, intervals, state, createdLinks, onMessageListeners, flush };
}

function messagesOf(harness, type) {
  return harness.sentMessages.filter(item => item.message.type === type).map(item => item.message);
}

function lastMessage(harness, type) {
  const message = messagesOf(harness, type).at(-1);
  return message ? JSON.parse(JSON.stringify(message)) : undefined;
}

test("sidepanel preserva replay, atualização de favorito/nota e exportação markdown", async () => {
  const harness = createHarness();
  await harness.flush();

  await harness.elements.get("#replay-current").listener("click")();
  assert.equal(messagesOf(harness, "SIA_REPLAY_LAST").length, 1);

  harness.elements.get("#export-saved").listener("click")();
  assert.equal(harness.state.alert, undefined);
  assert.equal(harness.createdLinks.at(-1)?.clicked, true);

  const favorite = harness.elements.get("#history").children[0].querySelector(".favorite");
  await favorite.listener("click")();
  assert.equal(messagesOf(harness, "SIA_UPDATE_HISTORY_ENTRY").length, 1);
});

test("sidepanel limpa o histórico da aula ao confirmar", async () => {
  const harness = createHarness();
  await harness.flush();
  assert.equal(harness.elements.get("#history").children.length, 1);

  await harness.elements.get("#clear-history").listener("click")();
  assert.deepEqual(lastMessage(harness, "SIA_CLEAR_HISTORY"), { type: "SIA_CLEAR_HISTORY" });
  await harness.flush();
  assert.equal(harness.elements.get("#history-count").textContent, "0 frases");
});

test("sidepanel explica quando não existe aula compatível e desabilita transcrição", async () => {
  const harness = createHarness({ context: { ok: false } });
  await harness.flush();
  assert.match(harness.elements.get("#current-sentence").textContent, /Abra uma aula compatível/);
  assert.equal(harness.elements.get("#generate-transcript").disabled, true);
  assert.equal(harness.elements.get("#replay-transcript").disabled, true);
  assert.equal(harness.elements.get("#download-transcript").disabled, true);
});

test("sidepanel apresenta estrutura limpa em 3 seções sem cartões confusos", () => {
  const html = fs.readFileSync(path.join(extensionRoot, "sidepanel.html"), "utf8");
  assert.match(html, /1 · AGORA/);
  assert.match(html, /Acompanhar a aula/);
  assert.match(html, /2 · Linha do tempo da aula/);
  assert.match(html, /3 · Legenda lida da aula/);

  // Garante que as seções confusas e desnecessárias foram completamente removidas
  assert.doesNotMatch(html, /COMO APRENDER COM A S·IA/);
  assert.doesNotMatch(html, /Ouça, guarde, lembre/);
  assert.doesNotMatch(html, /Guardar para aprender/);
  assert.doesNotMatch(html, /Responder para memorizar/);
  assert.doesNotMatch(html, /recall-answer/);
  assert.doesNotMatch(html, /bookmark-type/);
});

test("sidepanel orienta a aguardar frases antes de montar o arquivo", async () => {
  const context = baseStudyContext({ history: [] });
  const harness = createHarness({ context });
  await harness.flush();
  assert.equal(harness.elements.get("#generate-transcript").disabled, true);
  assert.equal(harness.elements.get("#replay-transcript").disabled, true);
  assert.match(harness.elements.get("#transcript-status").textContent, /Aguarde a S·IA ler/);
});

test("sidepanel monta todas as falas e só depois oferece a revisão no vídeo", async () => {
  const context = baseStudyContext();
  const harness = createHarness({
    context,
    transcriptResponse: {
      ok: true,
      transcricao: {
        texto: "A primeira fala da aula.\n\nA segunda fala da aula.",
        trechos: [
          { id: "history-1", texto: "A primeira fala da aula.", inicio: 12, fim: 16 },
          { id: "history-2", texto: "A segunda fala da aula.", inicio: 17, fim: 21 },
        ],
        totalFrases: 2,
        caracteres: 51,
      },
      fonte: "historico-local",
    },
  });
  await harness.flush();
  assert.equal(harness.elements.get("#replay-transcript").disabled, true);
  harness.elements.get("#generate-transcript").listener("click")();
  await harness.flush();
  assert.equal(harness.elements.get("#transcript-output").hidden, false);
  assert.equal(harness.elements.get("#lesson-transcript").textContent, "A primeira fala da aula.\n\nA segunda fala da aula.");
  assert.equal(harness.elements.get("#replay-transcript").disabled, false);
  assert.match(harness.elements.get("#transcript-count").textContent, /2 frases lidas/);
  assert.match(harness.elements.get("#transcript-status").textContent, /2 frases lidas exibidas/);

  harness.elements.get("#replay-transcript").listener("click")();
  await harness.flush();
  assert.deepEqual(lastMessage(harness, "SIA_REPLAY_LESSON_TRANSCRIPT"), {
    type: "SIA_REPLAY_LESSON_TRANSCRIPT",
  });
  assert.match(harness.elements.get("#transcript-status").textContent, /voltou ao primeiro trecho registrado/);
});

test("sidepanel salva todas as falas em um único arquivo local", async () => {
  const harness = createHarness({ context: baseStudyContext() });
  await harness.flush();
  harness.elements.get("#generate-transcript").listener("click")();
  await harness.flush();
  harness.elements.get("#download-transcript").listener("click")();

  const link = harness.createdLinks.at(-1);
  assert.equal(link.download, "sia-aula-legenda-lida.txt");
  assert.equal(harness.state.lastBlob.options.type, "text/plain;charset=utf-8");
  const content = harness.state.lastBlob.parts.join("");
  assert.match(content, /AULA: Aula/);
  assert.match(content, /Fala de teste\./);
  assert.match(harness.elements.get("#transcript-status").textContent, /salva no dispositivo/);
});

test("visualizador waveform reflete estado de fala ativa e retorno ao repouso", async () => {
  const harness = createHarness({ context: baseStudyContext({ isSpeaking: false }) });
  await harness.flush();

  const badge = harness.elements.get("#waveform-status-badge");
  const waveformStatus = harness.elements.get("#waveform-status-text");

  assert.equal(badge.dataset.state, "idle");
  assert.equal(waveformStatus.textContent, "Pronta");

  // Simula evento em tempo real da fala iniciada
  harness.onMessageListeners.forEach(listener => {
    listener({ type: "SIA_SPEECH_STATE", isSpeaking: true, text: "Nova frase sendo lida agora" });
  });
  assert.equal(badge.dataset.state, "speaking");
  assert.equal(waveformStatus.textContent, "Lendo agora");
  assert.equal(harness.elements.get("#current-sentence").textContent, "Nova frase sendo lida agora");

  // Simula cadência da fala por limite de palavras (onboundary)
  harness.onMessageListeners.forEach(listener => {
    listener({ type: "SIA_SPEECH_CADENCE", charIndex: 5, charLength: 4 });
  });

  // Simula término da fala
  harness.onMessageListeners.forEach(listener => {
    listener({ type: "SIA_SPEECH_STATE", isSpeaking: false });
  });
  assert.equal(badge.dataset.state, "idle");
  assert.equal(waveformStatus.textContent, "Pronta");

  // Simula perda de contexto (aba incompatível)
  harness.state.context = { ok: false };
  harness.intervals[0]();
  await harness.flush();
  assert.equal(badge.dataset.state, "disconnected");
  assert.equal(waveformStatus.textContent, "Desconectada");
});
