import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const selectionSource = fs.readFileSync(path.join(extensionRoot, "platform-selection.js"), "utf8");
const serviceWorkerSource = fs.readFileSync(path.join(extensionRoot, "service-worker.js"), "utf8");

function createHarness(initialLocal = {}) {
  const local = { ...initialLocal };
  const session = {};
  const executions = [];
  const tabMessages = [];
  const tabUpdatedListeners = [];
  const listeners = [];
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    Promise,
    URL,
    URLSearchParams,
    structuredClone: value => JSON.parse(JSON.stringify(value)),
  });
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          if (typeof keys === "string") return { [keys]: local[keys] };
          return Object.fromEntries((keys || []).map(key => [key, local[key]]));
        },
        async set(values) { Object.assign(local, values); },
        async remove(keys) { for (const key of keys) delete local[key]; },
      },
      session: {
        async get(keys) {
          if (typeof keys === "string") return { [keys]: session[keys] };
          return Object.fromEntries((keys || []).map(key => [key, session[key]]));
        },
        async set(values) { Object.assign(session, values); },
        async clear() { for (const key of Object.keys(session)) delete session[key]; },
      },
    },
    scripting: {
      async executeScript(details) { executions.push(details); },
    },
    tabs: {
      onRemoved: { addListener() {} },
      onUpdated: { addListener(listener) { tabUpdatedListeners.push(listener); } },
      async query() { return [{ id: 7, url: "https://www.youtube.com/watch?v=test" }]; },
      async sendMessage(tabId, message) { tabMessages.push({ tabId, message }); return { ok: true }; },
    },
    runtime: {
      onMessage: { addListener(listener) { listeners.push(listener); } },
      async sendMessage() { return { ok: true }; },
      getURL(file) { return `chrome-extension://test/${file}`; },
    },
    offscreen: { async createDocument() {}, async closeDocument() {} },
    commands: { onCommand: { addListener() {} } },
  };
  context.chrome = chrome;
  context.importScripts = (...files) => {
    for (const file of files) vm.runInContext(selectionSource, context, { filename: file });
  };
  vm.runInContext(serviceWorkerSource, context, { filename: "service-worker.js" });

  async function dispatch(message, sender = {}) {
    const listener = listeners[0];
    return new Promise((resolve, reject) => {
      try {
        const returned = listener(message, sender, response => resolve(response));
        if (returned !== true && returned !== false && returned !== undefined) resolve(returned);
        if (returned === false) resolve(undefined);
      } catch (error) {
        reject(error);
      }
    });
  }

  return { local, session, executions, tabMessages, tabUpdatedListeners, dispatch };
}

test("bootstrap request permanece bloqueado no YouTube por padrão", async () => {
  const harness = createHarness();
  const result = await harness.dispatch({
    target: "sia-platform-bootstrap-request",
    platformId: "youtube",
    url: "https://www.youtube.com/watch?v=test",
  }, { tab: { id: 7 } });
  assert.equal(result.active, false);
  assert.equal(result.waitingForSelection, true);
  assert.equal(harness.executions.length, 0);
});

test("bootstrap request injeta somente MAIN e ISOLATED após seleção YouTube", async () => {
  const harness = createHarness({ sia_platform_selections: { "youtube.com": "youtube" } });
  const result = await harness.dispatch({
    target: "sia-platform-bootstrap-request",
    platformId: "youtube",
    url: "https://www.youtube.com/watch?v=test",
  }, { tab: { id: 7 } });
  assert.equal(result.active, true);
  assert.equal(harness.executions.length, 2);
  assert.equal(harness.executions[0].world, "MAIN");
  assert.equal(JSON.stringify(harness.executions[0].files), JSON.stringify([
    "platform-adapters/youtube/youtube-caption-parser.js",
    "platform-adapters/youtube/youtube-caption-bridge.js",
  ]));
  assert.equal(harness.executions[1].world, "ISOLATED");
  assert.equal(harness.executions[1].files.includes("content.js"), true);
  assert.equal(harness.executions[1].files.includes("platform-adapters/youtube/youtube-host.js"), true);
});

test("override por aba tem precedência e mismatch de plataforma é rejeitado", async () => {
  const harness = createHarness({ sia_platform_selections: { "youtube.com": "off" } });
  harness.session.sia_platform_tab_selections = { "7": "youtube" };
  const bootstrap = await harness.dispatch({
    target: "sia-platform-bootstrap-request",
    platformId: "youtube",
    url: "https://www.youtube.com/watch?v=test",
  }, { tab: { id: 7 } });
  assert.equal(bootstrap.active, true);

  const mismatch = await harness.dispatch({
    target: "sia-platform-selection-apply",
    tabId: 7,
    url: "https://www.coursera.org/learn/test",
    mode: "youtube",
    scope: "tab",
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "platform-mismatch");
});

test("reload limpa somente o conjunto de injeção e preserva seleção de domínio", async () => {
  const harness = createHarness({ sia_platform_selections: { "youtube.com": "youtube" } });
  const first = await harness.dispatch({
    target: "sia-platform-bootstrap-request",
    platformId: "youtube",
    url: "https://www.youtube.com/watch?v=test",
  }, { tab: { id: 7 } });
  assert.equal(first.active, true);
  assert.equal(harness.executions.length, 2);
  harness.tabUpdatedListeners[0](7, { status: "loading" });
  const second = await harness.dispatch({
    target: "sia-platform-bootstrap-request",
    platformId: "youtube",
    url: "https://www.youtube.com/watch?v=test",
  }, { tab: { id: 7 } });
  assert.equal(second.active, true);
  assert.equal(harness.executions.length, 4);
  assert.equal(harness.local.sia_platform_selections["youtube.com"], "youtube");
});

test("aplicação por aba persiste a seleção e envia desativação ao content script", async () => {
  const harness = createHarness();
  const activate = await harness.dispatch({
    target: "sia-platform-selection-apply",
    tabId: 7,
    url: "https://www.youtube.com/watch?v=test",
    mode: "youtube",
    scope: "tab",
  });
  assert.equal(activate.active, true);
  assert.equal(harness.session.sia_platform_tab_selections["7"], "youtube");

  const deactivate = await harness.dispatch({
    target: "sia-platform-selection-apply",
    tabId: 7,
    url: "https://www.youtube.com/watch?v=test",
    mode: "off",
    scope: "tab",
  });
  assert.equal(deactivate.active, false);
  assert.equal(harness.session.sia_platform_tab_selections["7"], "off");
  assert.equal(harness.tabMessages.some(item => item.message.type === "SIA_PLATFORM_DEACTIVATE"), true);
});
