import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const selectionSource = fs.readFileSync(path.join(extensionRoot, "platform-selection.js"), "utf8");
const popupSource = fs.readFileSync(path.join(extensionRoot, "popup.js"), "utf8");

function createElement(id, value = "") {
  const listeners = new Map();
  const element = {
    id,
    value,
    textContent: "",
    className: "",
    classList: {
      toggle() {},
      add() {},
      remove() {},
    },
    style: { setProperty() {} },
    options: [],
    selectedOptions: [],
    checked: false,
    disabled: false,
    min: "0",
    max: "100",
    addEventListener(name, listener) { listeners.set(name, listener); },
    listener(name) { return listeners.get(name); },
    setAttribute() {},
    querySelector() { return createElement(`${id}-child`); },
    replaceChildren(...children) {
      this.options = children;
      this.selectedOptions = children.filter(child => child.value === this.value);
    },
    append(...children) {
      this.options.push(...children);
      this.selectedOptions = this.options.filter(child => child.value === this.value);
    },
  };
  return element;
}

function createHarness({ statusResponse = null, requestedPlatform = "off", applyResponse = null } = {}) {
  const elements = new Map();
  const ids = [
    "toggle-power", "toggle-compact", "summary-voice", "summary-speed", "summary-audio", "summary-sync",
    "select-engine", "select-voice", "select-lang", "input-speed", "label-speed", "input-pitch", "label-pitch",
    "input-volume", "label-volume", "replay-last", "open-companion", "test-voice", "reset-settings",
    "connection-status", "save-feedback", "version-label", "select-platform", "platform-scope",
    "apply-platform", "platform-diagnostic",
  ];
  for (const id of ids) elements.set(`#${id}`, createElement(id));
  elements.set(".container", createElement("container"));
  elements.set(".power-text", createElement("power-text"));
  elements.get("#select-platform").options = ["off", "auto", "coursera", "udemy", "youtube"].map(value => createElement(`platform-${value}`, value));
  elements.get("#select-platform").value = "off";
  elements.get("#select-platform").selectedOptions = [elements.get("#select-platform").options[0]];
  elements.get("#select-engine").value = "browser";
  elements.get("#select-lang").value = "pt-BR";
  elements.get("#input-speed").value = "1.2";
  elements.get("#input-pitch").value = "1";
  elements.get("#input-volume").value = "100";
  const connectionStatusSpan = createElement("connection-status-child");
  elements.get("#connection-status").querySelector = () => connectionStatusSpan;
  const radios = ["accelerate_voice", "slow_video"].map(value => {
    const radio = createElement(`sync-${value}`, value);
    radio.checked = value === "accelerate_voice";
    return radio;
  });
  const intervals = [];
  const reloads = [];
  const runtimeMessages = [];
  let domReady;
  const documentRef = {
    addEventListener(name, listener) { if (name === "DOMContentLoaded") domReady = listener; },
    getElementById(id) { return elements.get(`#${id}`) || null; },
    querySelector(selector) { return elements.get(selector) || null; },
    querySelectorAll(selector) { return selector === 'input[name="sync-behavior"]' ? radios : []; },
  };
  const tab = { id: 17, url: "https://www.youtube.com/watch?v=fixture" };
  const local = {};
  const context = vm.createContext({
    console,
    document: documentRef,
    URL,
    setTimeout,
    clearTimeout,
    setInterval(callback) { intervals.push(callback); return intervals.length; },
    clearInterval() {},
    Option: class {
      constructor(text, optionValue) {
        this.textContent = text;
        this.value = optionValue;
        this.dataset = {};
      }
    },
    Event: class { constructor() {} },
    speechSynthesis: {
      getVoices() { return []; },
      cancel() {},
      addEventListener() {},
    },
    window: { close() {} },
  });
  context.globalThis = context;
  vm.runInContext(selectionSource, context, { filename: "platform-selection.js" });
  context.chrome = {
    storage: {
      local: {
        async get() { return { ...local }; },
        async set(values) { Object.assign(local, values); },
        async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete local[key]; },
      },
    },
    runtime: {
      getManifest() { return { version: "1.8.17", version_name: "teste" }; },
      async sendMessage(message) {
        runtimeMessages.push(message);
        if (message.target === "sia-platform-selection-get") {
          return { ok: true, requested: requestedPlatform, compatible: requestedPlatform === "youtube", source: "test", hostKey: "youtube.com" };
        }
        if (message.target === "sia-platform-selection-apply") {
          return applyResponse || { ok: true, active: true, platformId: "youtube" };
        }
        return { ok: true };
      },
    },
    tabs: {
      async query() { return [tab]; },
      async sendMessage() {
        return statusResponse || { videoFound: true, syncEngineReady: true, paused: false, ended: false, captionActive: false, speechError: "" };
      },
      async reload(tabId) { reloads.push(tabId); },
    },
    sidePanel: { async open() {} },
  };
  vm.runInContext(popupSource, context, { filename: "popup.js" });
  return { elements, intervals, reloads, runtimeMessages, domReady, context, connectionStatusSpan };
}

test("popup sinaliza AudioContext bloqueado em vez de mostrar conexão genérica", async () => {
  const harness = createHarness({
    requestedPlatform: "youtube",
    statusResponse: {
      videoFound: true,
      syncEngineReady: true,
      paused: false,
      ended: false,
      captionActive: false,
      speechError: "",
      voiceEngine: "piper-local",
      voiceEngineState: "ready",
      audioState: "blocked",
      audioError: "AudioContext bloqueado"
    }
  });
  await harness.domReady();
  await harness.intervals[0]();
  const label = harness.connectionStatusSpan.textContent;
  assert.match(label, /Piper aguardando gesto/);
  assert.doesNotMatch(label, /Conectada/);
});

test("popup não mostra conexão genérica quando YouTube não tem legenda temporal", async () => {
  const harness = createHarness({
    requestedPlatform: "youtube",
    statusResponse: {
      videoFound: true,
      syncEngineReady: true,
      paused: false,
      ended: false,
      captionActive: false,
      speechError: "",
      voiceEngine: "browser",
      voiceEngineState: "ready",
      audioState: "running",
      platformId: "youtube",
      platformDiagnostic: {
        state: "PRIMARY_UNAVAILABLE",
        reason: "caption-source-unavailable"
      }
    }
  });
  await harness.domReady();
  await harness.intervals[0]();
  const label = harness.connectionStatusSpan.textContent;
  assert.match(label, /legenda temporal indisponível/);
  assert.doesNotMatch(label, /Conectada/);
});

test("popup recarrega a aba quando YouTube já estava injetado", async () => {
  const harness = createHarness({
    requestedPlatform: "youtube",
    applyResponse: { ok: true, alreadyActive: true, platformId: "youtube" },
  });
  await harness.domReady();
  await new Promise(resolve => setImmediate(resolve));
  const select = harness.elements.get("#select-platform");
  const apply = harness.elements.get("#apply-platform");
  select.value = "youtube";
  select.listener("change")();
  apply.listener("click")();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.runtimeMessages.at(-1).target, "sia-platform-selection-apply");
  assert.deepEqual(harness.reloads, [17]);
});

test("popup mantém YouTube após updateConnectionStatus e aplica na aba", async () => {
  const harness = createHarness();
  await harness.domReady();
  const select = harness.elements.get("#select-platform");
  const apply = harness.elements.get("#apply-platform");
  select.value = "youtube";
  select.listener("change")();
  assert.equal(select.value, "youtube");
  assert.equal(apply.disabled, false);

  await harness.intervals[0]();
  assert.equal(select.value, "youtube");
  assert.equal(apply.disabled, false);

  const scope = harness.elements.get("#platform-scope");
  scope.checked = true;
  scope.listener("change")();
  await harness.intervals[0]();
  assert.equal(scope.checked, true);
  assert.equal(select.value, "youtube");

  apply.listener("click")();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.runtimeMessages.at(-1).target, "sia-platform-selection-apply");
  assert.equal(harness.runtimeMessages.at(-1).scope, "domain");
  assert.deepEqual(harness.reloads, [17]);
});
