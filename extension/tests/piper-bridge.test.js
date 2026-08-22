const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const bridgeSource = fs.readFileSync(
  path.join(__dirname, "..", "neural-tts", "piper-bridge.js"),
  "utf8"
);

function createHarness({ engine = "browser", failGeneration = false } = {}) {
  const storageChanges = [];
  const messages = [];
  const played = [];
  const generationMessages = [];
  let workerCount = 0;
  let generationCount = 0;

  const chrome = {
    runtime: {
      getURL: value => `chrome-extension://test/${value}`,
      onMessage: { addListener: callback => messages.push(callback) }
    },
    storage: {
      local: {
        get: (_key, callback) => callback({ sia_voice_engine: engine }),
        set: async value => storageChanges.push(value)
      },
      onChanged: {
        addListener: callback => storageChanges.push(callback)
      }
    }
  };

  class FakeSource {
    constructor() {
      this.onended = null;
      this.detune = { value: 0 };
      this.buffer = null;
    }

    connect() {}

    start() {
      played.push(this);
      setTimeout(() => this.onended?.(), 0);
    }

    stop() {
      this.onended = null;
    }
  }

  class FakeWorker {
    constructor() {
      workerCount += 1;
      this.onmessage = null;
      this.onerror = null;
      this.terminated = false;
      setTimeout(() => this.onmessage?.({
        data: {
          type: "sia-piper-ready",
          sampleRate: 22050,
          numSpeakers: 1
        }
      }), 0);
    }

    postMessage(message) {
      if (message.type !== "sia-piper-generate") return;
      generationCount += 1;
      generationMessages.push(message);
      setTimeout(() => {
        if (failGeneration) {
          this.onmessage?.({
            data: {
              type: "sia-piper-error",
              requestId: message.requestId,
              message: "simulated generation error"
            }
          });
          return;
        }
        const samples = new Float32Array([0, 0.1, 0]);
        this.onmessage?.({
          data: {
            type: "sia-piper-result",
            requestId: message.requestId,
            samples,
            sampleRate: 22050,
            durationSeconds: samples.length / 22050
          }
        });
      }, 0);
    }

    terminate() {
      this.terminated = true;
    }
  }

  class FakeAudioContext {
    constructor() {
      this.state = "running";
      this.destination = {};
    }

    async resume() {}

    createBuffer(_channels, length, sampleRate) {
      const channel = new Float32Array(length);
      return {
        length,
        sampleRate,
        getChannelData: () => channel
      };
    }

    createBufferSource() {
      return new FakeSource();
    }

    createGain() {
      return {
        gain: { value: 1 },
        connect() {}
      };
    }
  }

  const context = {
    console,
    chrome,
    Worker: FakeWorker,
    AudioContext: FakeAudioContext,
    performance: { now: () => Date.now() },
    setTimeout,
    clearTimeout,
    Error,
    Map,
    Math,
    Number,
    String,
    Float32Array,
    globalThis: null
  };
  context.globalThis = context;
  vm.runInNewContext(bridgeSource, context, { filename: "piper-bridge.js" });

  return {
    provider: context.SiaPiperVoice,
    status: context.SiaPiperVoiceStatus,
    messages,
    played,
    generationMessages,
    storageChanges,
    get workerCount() {
      return workerCount;
    },
    get generationCount() {
      return generationCount;
    }
  };
}

test("mantém o motor do navegador como padrão", () => {
  const harness = createHarness();
  assert.equal(harness.provider.isActive(), false);
  assert.equal(harness.status().engine, "browser");
});

test("não assina mudanças globais de motor entre abas", () => {
  const harness = createHarness();
  assert.equal(harness.storageChanges.some(change => typeof change === "function"), false);
});

test("ativa o Piper somente quando selecionado e reproduz o resultado do Worker", async () => {
  const harness = createHarness();
  const events = [];
  harness.provider.setActive("piper-local");
  assert.equal(harness.provider.isActive(), true);
  assert.equal(harness.provider.speak({
    text: "Olá, mundo.",
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: () => events.push("start"),
    onend: () => events.push("end"),
    onerror: () => events.push("error")
  }), true);

  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual(events, ["start", "end"]);
  assert.equal(harness.status().state, "ready");
  assert.equal(harness.played.length, 1);
  assert.equal(harness.workerCount, 1);
});

test("reutiliza a frase pré-sintetizada sem gerar áudio duas vezes", async () => {
  const harness = createHarness();
  const utterance = {
    text: "Frase pré-sintetizada.",
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: () => {},
    onend: () => {},
    onerror: () => {}
  };

  harness.provider.setActive("piper-local");
  assert.equal(await harness.provider.primeText(utterance), true);
  harness.provider.speak(utterance);
  await new Promise(resolve => setTimeout(resolve, 40));

  assert.equal(harness.generationCount, 1);
  assert.equal(harness.played.length, 1);
});

test("transporta perfil de continuação e não o confunde com o áudio normal", async () => {
  const harness = createHarness();
  harness.provider.setActive("piper-local");
  await harness.provider.primeText({
    text: "A frase continua,",
    rate: 1.2,
    silenceScale: 0.08,
  });
  await new Promise(resolve => setTimeout(resolve, 10));

  harness.provider.speak({
    text: "A frase continua,",
    rate: 1.2,
    silenceScale: 0.08,
    onstart: () => {},
    onend: () => {},
    onerror: () => {}
  });
  await new Promise(resolve => setTimeout(resolve, 40));

  assert.equal(harness.generationMessages.length, 1);
  assert.equal(harness.generationMessages[0].silenceScale, 0.08);
});

test("desativa e cancela a fila sem gerar exceção", async () => {
  const harness = createHarness();
  harness.provider.setActive("piper-local");
  harness.provider.speak({
    text: "Frase cancelada.",
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: () => {},
    onend: () => {},
    onerror: () => {}
  });
  harness.provider.setActive("browser");
  assert.equal(harness.provider.isActive(), false);
  assert.equal(harness.status().engine, "browser");
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(harness.played.length, 0);
});

test("converte falha de geração em desativação do provedor", async () => {
  const harness = createHarness({ failGeneration: true });
  const errors = [];
  harness.provider.setActive("piper-local");
  harness.provider.speak({
    text: "Falha controlada.",
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: () => {},
    onend: () => {},
    onerror: event => errors.push(event?.error)
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(harness.provider.isActive(), false);
  assert.deepEqual(errors, ["piper-fallback"]);
});

test("prepara o AudioContext antes da geração neural", async () => {
  const harness = createHarness();
  harness.provider.setActive("piper-local");
  const result = await harness.provider.primeAudio();
  assert.equal(result.ok, true);
  assert.equal(result.state, "running");
});
