const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "..", "offscreen.js"),
  "utf8"
);

function createHarness() {
  const listeners = [];
  const workers = [];
  const posted = [];

  class FakeWorker {
    constructor() {
      this.onmessage = null;
      this.onerror = null;
      this.terminated = false;
      workers.push(this);
      setTimeout(() => this.onmessage?.({
        data: {
          type: "sia-piper-ready",
          sampleRate: 22050,
          numSpeakers: 1
        }
      }), 0);
    }

    postMessage(message) {
      posted.push(message);
      if (message.type === "sia-piper-generate") {
        const delay = message.text === "late" ? 25 : 0;
        setTimeout(() => {
          if (this.terminated) return;
          const marker = message.sessionId === "tab-a" ? 1 : 2;
          const samples = new Float32Array([marker, marker + 0.1]);
          this.onmessage?.({
            data: {
              type: "sia-piper-result",
              sessionId: message.sessionId,
              requestId: message.requestId,
              samples,
              sampleRate: 22050,
              durationSeconds: samples.length / 22050
            }
          });
        }, delay);
      }
    }

    terminate() {
      this.terminated = true;
    }
  }

  let listener;
  const chrome = {
    runtime: {
      getURL: value => `chrome-extension://test/${value}`,
      onMessage: {
        addListener(callback) {
          listener = callback;
          listeners.push(callback);
        }
      }
    }
  };
  const context = vm.createContext({
    chrome,
    Worker: FakeWorker,
    setTimeout,
    clearTimeout,
    Promise,
    Map,
    Set,
    String,
    Number,
    Error,
    Float32Array,
    console,
    globalThis: null
  });
  context.globalThis = context;
  vm.runInContext(source, context, { filename: "offscreen.js" });

  function dispatch(message) {
    return new Promise((resolve, reject) => {
      if (!listener) {
        reject(new Error("listener offscreen não instalado"));
        return;
      }
      listener(message, {}, response => resolve(response));
    });
  }

  return { dispatch, workers, listeners, posted };
}

test("offscreen correlaciona duas abas mesmo com requestId repetido", async () => {
  const harness = createHarness();
  await Promise.all([
    harness.dispatch({ target: "sia-piper-offscreen", command: "init", sessionId: "tab-a" }),
    harness.dispatch({ target: "sia-piper-offscreen", command: "init", sessionId: "tab-b" })
  ]);

  const [resultA, resultB] = await Promise.all([
    harness.dispatch({
      target: "sia-piper-offscreen",
      command: "generate",
      sessionId: "tab-a",
      requestId: 1,
      text: "frase A",
      speed: 1
    }),
    harness.dispatch({
      target: "sia-piper-offscreen",
      command: "generate",
      sessionId: "tab-b",
      requestId: 1,
      text: "frase B",
      speed: 1
    })
  ]);

  assert.equal(resultA.samples.length, 2);
  assert.equal(resultB.samples.length, 2);
  assert.equal(resultA.samples[0], 1);
  assert.equal(resultB.samples[0], 2);
  assert.ok(Math.abs(resultA.samples[1] - 1.1) < 1e-5);
  assert.ok(Math.abs(resultB.samples[1] - 2.1) < 1e-5);
  assert.equal(resultA.sessionId, "tab-a");
  assert.equal(resultB.sessionId, "tab-b");
  assert.equal(harness.workers.length, 1);
});

test("offscreen encaminha silenceScale para o worker Piper", async () => {
  const harness = createHarness();
  await harness.dispatch({ target: "sia-piper-offscreen", command: "init", sessionId: "tab-a" });
  await harness.dispatch({
    target: "sia-piper-offscreen",
    command: "generate",
    sessionId: "tab-a",
    requestId: 1,
    text: "frase de continuação,",
    speed: 1.2,
    silenceScale: 0.08
  });
  const generate = harness.posted.find(message => message.type === "sia-piper-generate");
  assert.equal(generate.silenceScale, 0.08);
  assert.equal(generate.sessionId, "tab-a");
  assert.equal(generate.speed, 1.2);
});

test("dispose de uma aba não encerra o worker da outra sessão", async () => {
  const harness = createHarness();
  await Promise.all([
    harness.dispatch({ target: "sia-piper-offscreen", command: "init", sessionId: "tab-a" }),
    harness.dispatch({ target: "sia-piper-offscreen", command: "init", sessionId: "tab-b" })
  ]);

  const pendingB = harness.dispatch({
    target: "sia-piper-offscreen",
    command: "generate",
    sessionId: "tab-b",
    requestId: 1,
    text: "late",
    speed: 1
  });
  const disposeA = await harness.dispatch({
    target: "sia-piper-offscreen",
    command: "dispose",
    sessionId: "tab-a"
  });

  assert.equal(disposeA.ok, true);
  assert.equal(harness.workers[0].terminated, false);
  const resultB = await pendingB;
  assert.equal(resultB.samples.length, 2);
  assert.equal(resultB.samples[0], 2);
  assert.ok(Math.abs(resultB.samples[1] - 2.1) < 1e-5);

  await harness.dispatch({
    target: "sia-piper-offscreen",
    command: "dispose",
    sessionId: "tab-b"
  });
  assert.equal(harness.workers[0].terminated, true);
});
