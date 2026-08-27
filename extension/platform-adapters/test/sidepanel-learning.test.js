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
    study: {
      enabled: true,
      currentCue: null,
      bookmarks: [],
      cards: [],
      dueCards: [],
      progress: { total: 0, revisados: 0, pendentes: 0 },
    },
    ...overrides,
  };
}

function createHarness({ context = baseStudyContext(), createResponse = null, reviewResponse = null, transcriptResponse = null, readTranscriptResponse = null } = {}) {
  const ids = [
    "current-sentence", "replay-current", "history", "history-count", "export-saved", "clear-history",
    "history-item-template", "study-progress", "due-count", "bookmark-type", "bookmark-current", "clear-study",
    "generate-transcript", "read-transcript", "download-transcript", "transcript-count", "transcript-status", "transcript-output", "lesson-transcript",
    "study-feedback", "recall-question", "recall-answer", "reveal-recall", "recall-source",
  ];
  const elements = new Map(ids.map(id => [`#${id}`, createElement(id)]));
  elements.get("#history-item-template").content = { firstElementChild: createHistoryItem() };
  elements.get("#bookmark-type").value = "concept";
  const filters = [
    createElement("filter-all", { dataset: { filter: "all" } }),
    createElement("filter-favorites", { dataset: { filter: "favorites" } }),
  ];
  filters[0].classList.add("active");
  const ratings = ["remembered", "partial", "forgot"].map(rating =>
    createElement(`rating-${rating}`, { dataset: { rating } })
  );
  const createdLinks = [];
  const documentRef = {
    getElementById(id) { return elements.get(`#${id}`) || null; },
    querySelectorAll(selector) {
      if (selector === ".filter") return filters;
      if (selector === "[data-rating]") return ratings;
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
    alert(message) { state.alert = message; },
    confirm() { return true; },
    prompt() { return "nota editada"; },
    Date,
  });
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
        if (message.type === "SIA_READ_LESSON_TRANSCRIPT") return readTranscriptResponse || { ok: true, reason: "transcript-queued", partes: 1 };
        if (message.type === "SIA_CREATE_STUDY_BOOKMARK") return createResponse || { ok: true, duplicate: false };
        if (message.type === "SIA_REVIEW_STUDY_CARD") return reviewResponse || { ok: true };
        if (message.type === "SIA_CLEAR_STUDY") {
          state.context = {
            ...state.context,
            study: {
              enabled: true,
              currentCue: null,
              bookmarks: [],
              cards: [],
              dueCards: [],
              progress: { total: 0, revisados: 0, pendentes: 0 },
            },
          };
          return { ok: true };
        }
        if (message.type === "SIA_UPDATE_HISTORY_ENTRY") {
          return { ok: true, entry: { ...state.context.history[0], favorito: message.favorite, nota: message.note } };
        }
        return { ok: true };
      },
    },
  };
  vm.runInContext(sidepanelSource, contextVm, { filename: "sidepanel.js" });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { elements, filters, ratings, sentMessages, intervals, state, createdLinks, flush };
}

function messagesOf(harness, type) {
  return harness.sentMessages.filter(item => item.message.type === type).map(item => item.message);
}

function lastMessage(harness, type) {
  const message = messagesOf(harness, type).at(-1);
  return message ? JSON.parse(JSON.stringify(message)) : undefined;
}

test("sidepanel desabilita marcação sem cue temporal atual", async () => {
  const harness = createHarness();
  await harness.flush();
  assert.equal(harness.elements.get("#bookmark-current").disabled, true);
  assert.match(harness.elements.get("#recall-question").textContent, /Guarde um trecho acima/);
});

test("sidepanel marca a cue atual usando o tipo escolhido", async () => {
  const context = baseStudyContext({
    study: {
      enabled: true,
      currentCue: { text: "Definição importante", startTime: 10, endTime: 14 },
      bookmarks: [], cards: [], dueCards: [], progress: { total: 0, revisados: 0, pendentes: 0 },
    },
  });
  const harness = createHarness({ context });
  await harness.flush();
  const bookmark = harness.elements.get("#bookmark-current");
  assert.equal(bookmark.disabled, false);
  harness.elements.get("#bookmark-type").value = "important";
  bookmark.listener("click")();
  await harness.flush();
  assert.deepEqual(lastMessage(harness, "SIA_CREATE_STUDY_BOOKMARK"), {
    type: "SIA_CREATE_STUDY_BOOKMARK",
    bookmarkType: "important",
  });
  assert.match(harness.elements.get("#study-feedback").textContent, /virou uma pergunta/);
});

test("sidepanel revela o texto original do cartão pendente", async () => {
  const card = { id: "card-1", pergunta: "O que é recuperação?", texto: "Recuperar é tentar lembrar." };
  const context = baseStudyContext({ study: {
    enabled: true,
    currentCue: null,
    bookmarks: [{ id: "mark-1", texto: card.texto }],
    cards: [card],
    dueCards: [card],
    progress: { total: 1, revisados: 0, pendentes: 1 },
  } });
  const harness = createHarness({ context });
  await harness.flush();
  const reveal = harness.elements.get("#reveal-recall");
  assert.equal(reveal.disabled, false);
  await reveal.listener("click")();
  assert.equal(harness.elements.get("#recall-source").hidden, false);
  assert.equal(harness.elements.get("#recall-source").textContent, card.texto);
});

test("sidepanel exige resposta para lembrei e envia resposta quando preenchida", async () => {
  const card = { id: "card-2", pergunta: "Explique o conceito", texto: "Texto do conceito" };
  const context = baseStudyContext({ study: {
    enabled: true, currentCue: null, bookmarks: [], cards: [card], dueCards: [card],
    progress: { total: 1, revisados: 0, pendentes: 1 },
  } });
  const harness = createHarness({ context });
  await harness.flush();
  harness.ratings[0].listener("click")();
  await harness.flush();
  assert.equal(messagesOf(harness, "SIA_REVIEW_STUDY_CARD").length, 0);
  assert.match(harness.elements.get("#study-feedback").textContent, /Antes de escolher/);
  harness.elements.get("#recall-answer").value = "Minha resposta local";
  harness.ratings[0].listener("click")();
  await harness.flush();
  assert.deepEqual(lastMessage(harness, "SIA_REVIEW_STUDY_CARD"), {
    type: "SIA_REVIEW_STUDY_CARD",
    cardId: card.id,
    rating: "remembered",
    answer: "Minha resposta local",
  });
  assert.match(harness.elements.get("#study-feedback").textContent, /Você marcou que lembrou/);
});

test("sidepanel permite esqueci sem resposta e preserva replay, atualização e exportação", async () => {
  const card = { id: "card-3", pergunta: "Lembre?", texto: "Trecho temporal" };
  const context = baseStudyContext({ study: {
    enabled: true, currentCue: null, bookmarks: [], cards: [card], dueCards: [card],
    progress: { total: 1, revisados: 0, pendentes: 1 },
  } });
  const harness = createHarness({ context });
  await harness.flush();
  harness.ratings[2].listener("click")();
  await harness.flush();
  assert.deepEqual(lastMessage(harness, "SIA_REVIEW_STUDY_CARD"), {
    type: "SIA_REVIEW_STUDY_CARD",
    cardId: card.id,
    rating: "forgot",
    answer: "",
  });

  await harness.elements.get("#replay-current").listener("click")();
  assert.equal(messagesOf(harness, "SIA_REPLAY_LAST").length, 1);
  harness.elements.get("#export-saved").listener("click")();
  assert.equal(harness.state.alert, undefined);
  assert.equal(harness.createdLinks.at(-1)?.clicked, true);
  const favorite = harness.elements.get("#history").children[0].querySelector(".favorite");
  await favorite.listener("click")();
  assert.equal(messagesOf(harness, "SIA_UPDATE_HISTORY_ENTRY").length, 1);
});

test("sidepanel limpa apenas o estudo e preserva o histórico da aula", async () => {
  const card = { id: "card-clear", pergunta: "Pergunta local", texto: "Trecho salvo" };
  const context = baseStudyContext({ study: {
    enabled: true, currentCue: null, bookmarks: [{ id: "mark-clear", texto: card.texto }],
    cards: [card], dueCards: [card], progress: { total: 1, revisados: 0, pendentes: 1 },
  } });
  const harness = createHarness({ context });
  await harness.flush();
  await harness.elements.get("#clear-study").listener("click")();
  assert.deepEqual(lastMessage(harness, "SIA_CLEAR_STUDY"), { type: "SIA_CLEAR_STUDY" });
  assert.match(harness.elements.get("#study-feedback").textContent, /Estudo local apagado/);
  assert.match(harness.elements.get("#recall-question").textContent, /Guarde um trecho acima/);
  assert.equal(harness.elements.get("#history").children.length, 1);
});

test("sidepanel explica quando não existe aula compatível e desabilita o estudo", async () => {
  const harness = createHarness({ context: { ok: false } });
  await harness.flush();
  assert.match(harness.elements.get("#current-sentence").textContent, /Abra uma aula compatível/);
  assert.equal(harness.elements.get("#bookmark-current").disabled, true);
  assert.equal(harness.elements.get("#clear-study").disabled, true);
  assert.equal(harness.elements.get("#recall-answer").disabled, true);
  assert.equal(harness.elements.get("#reveal-recall").disabled, true);
  assert.equal(harness.ratings.every(button => button.disabled), true);
});

test("sidepanel apresenta a jornada autoexplicativa no próprio HTML", () => {
  const html = fs.readFileSync(path.join(extensionRoot, "sidepanel.html"), "utf8");
  assert.match(html, /Ouça, guarde, lembre/);
  assert.match(html, /1 · AGORA/);
  assert.match(html, /Acompanhar a aula/);
  assert.match(html, /2 · Legenda lida da aula/);
  assert.match(html, /3 · Guardar para aprender/);
  assert.match(html, /4 · Responder para memorizar/);
  assert.match(html, /5 · Linha do tempo da aula/);
  assert.match(html, /Guardar este trecho/);
  assert.match(html, /Lembrei uma parte/);
});

test("sidepanel orienta a aguardar frases antes de montar o arquivo", async () => {
  const context = baseStudyContext({ history: [] });
  const harness = createHarness({ context });
  await harness.flush();
  assert.equal(harness.elements.get("#generate-transcript").disabled, true);
  assert.equal(harness.elements.get("#read-transcript").disabled, true);
  assert.match(harness.elements.get("#transcript-status").textContent, /Aguarde a S·IA ler/);
});

test("sidepanel monta todas as falas e só depois oferece sua leitura", async () => {
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
  assert.equal(harness.elements.get("#read-transcript").disabled, true);
  harness.elements.get("#generate-transcript").listener("click")();
  await harness.flush();
  assert.equal(harness.elements.get("#transcript-output").hidden, false);
  assert.equal(harness.elements.get("#lesson-transcript").textContent, "A primeira fala da aula.\n\nA segunda fala da aula.");
  assert.equal(harness.elements.get("#read-transcript").disabled, false);
  assert.match(harness.elements.get("#transcript-count").textContent, /2 frases lidas/);
  assert.match(harness.elements.get("#transcript-status").textContent, /2 frases lidas exibidas/);

  harness.elements.get("#read-transcript").listener("click")();
  await harness.flush();
  assert.deepEqual(lastMessage(harness, "SIA_READ_LESSON_TRANSCRIPT"), {
    type: "SIA_READ_LESSON_TRANSCRIPT",
    text: "A primeira fala da aula.\n\nA segunda fala da aula.",
  });
  assert.match(harness.elements.get("#transcript-status").textContent, /enviadas para a leitura/);
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
