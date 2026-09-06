const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const bridgeSource = fs.readFileSync(
  path.join(__dirname, "..", "neural-tts", "piper-bridge.js"),
  "utf8"
);

function createHarness({ engine = "browser", failGeneration = false, audioBlocked = false, audioResumePending = false } = {}) {
  const storageChanges = [];
  const messages = [];
  const played = [];
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

  let audioUnlocked = !audioBlocked;

  class FakeAudioContext {
    constructor() {
      this.state = audioUnlocked ? "running" : "suspended";
      this.destination = {};
    }

    async resume() {
      if (!audioUnlocked) {
        if (audioResumePending) return new Promise(() => {});
        const error = new Error("The user didn't interact with the document first");
        error.name = "NotAllowedError";
        throw error;
      }
      this.state = "running";
    }

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
        gain: { value: 1, setValueAtTime(v) { this.value = v; } },
        connect() {}
      };
    }

    createBiquadFilter() {
      return {
        type: "peaking",
        frequency: { value: 3800, setValueAtTime(v) { this.value = v; } },
        Q: { value: 0.9, setValueAtTime(v) { this.value = v; } },
        gain: { value: 2.5, setValueAtTime(v) { this.value = v; } },
        connect() {}
      };
    }

    createDelay() {
      return {
        delayTime: { value: 0, setValueAtTime(v) { this.value = v; } },
        connect() {}
      };
    }

    createChannelMerger() {
      return {
        connect() {}
      };
    }

    createStereoPanner() {
      return {
        pan: { value: 0, setValueAtTime(v) { this.value = v; } },
        connect() {}
      };
    }

    createPanner() {
      return {
        panningModel: "equalpower",
        distanceModel: "inverse",
        refDistance: 1,
        maxDistance: 10000,
        rolloffFactor: 0.5,
        coneInnerAngle: 360,
        positionX: { value: 0, setValueAtTime(v) { this.value = v; } },
        positionY: { value: 0, setValueAtTime(v) { this.value = v; } },
        positionZ: { value: 0, setValueAtTime(v) { this.value = v; } },
        setPosition(x, y, z) {
          this.positionX.value = x;
          this.positionY.value = y;
          this.positionZ.value = z;
        },
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
    storageChanges,
    get workerCount() {
      return workerCount;
    },
    get generationCount() {
      return generationCount;
    },
    unlockAudio() {
      audioUnlocked = true;
      if (context.SiaPiperVoice?.audioContext) context.SiaPiperVoice.audioContext.state = "running";
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

test("preserva a cue quando o AudioContext está bloqueado e retoma após gesto", async () => {
  const harness = createHarness({ audioBlocked: true });
  const events = [];
  harness.provider.setActive("piper-local");
  harness.provider.speak({
    text: "Frase aguardando gesto.",
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: () => events.push("start"),
    onend: () => events.push("end"),
    onerror: () => events.push("error")
  });

  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(harness.provider.isActive(), true);
  assert.equal(events.length, 0);
  assert.equal(harness.played.length, 0);
  assert.equal(harness.status().audioState, "blocked");
  assert.equal(harness.status().queued, 1);

  harness.unlockAudio();
  const primed = await harness.provider.primeAudio();
  assert.equal(primed.ok, true);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual(events, ["start", "end"]);
  assert.equal(harness.played.length, 1);
});

test("converte resume pendente em bloqueio recuperável sem perder a cue", async () => {
  const harness = createHarness({ audioBlocked: true, audioResumePending: true });
  const events = [];
  harness.provider.setActive("piper-local");
  harness.provider.speak({
    text: "Frase com gesto posterior.",
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: () => events.push("start"),
    onend: () => events.push("end"),
    onerror: () => events.push("error")
  });

  await new Promise(resolve => setTimeout(resolve, 1400));
  assert.equal(harness.provider.isActive(), true);
  assert.deepEqual(events, []);
  assert.equal(harness.status().audioState, "blocked");
  assert.equal(harness.status().queued, 1);

  harness.unlockAudio();
  const primed = await harness.provider.primeAudio();
  assert.equal(primed.ok, true);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual(events, ["start", "end"]);
  assert.equal(harness.played.length, 1);
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

test("não tenta abrir o AudioContext automaticamente ao selecionar Piper", async () => {
  const harness = createHarness({ audioBlocked: true });
  harness.provider.setActive("piper-local");
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(harness.status().audioState, "awaiting-gesture");
  assert.equal(harness.played.length, 0);
});

test("transição suave entre legendas: não interrompe a fala anterior e reproduz a nova em sequência", async () => {
  const harness = createHarness();
  const events = [];
  harness.provider.setActive("piper-local");

  harness.provider.speak({
    text: "Primeira legenda em reprodução.",
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: () => events.push("start-1"),
    onend: () => events.push("end-1"),
    onerror: () => events.push("error-1")
  });

  await new Promise(resolve => setTimeout(resolve, 15));

  harness.provider.speak({
    text: "Segunda legenda seguinte.",
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: () => events.push("start-2"),
    onend: () => events.push("end-2"),
    onerror: () => events.push("error-2")
  });

  await new Promise(resolve => setTimeout(resolve, 80));

  assert.deepEqual(events, ["start-1", "end-1", "start-2", "end-2"]);
  assert.equal(harness.played.length, 2);
});

test("configura e posiciona a voz 3D no espaço com áudio cristalino 4K transparente (equalpower) e livre de abafamento", async () => {
  const harness = createHarness();
  harness.provider.setActive("piper-local");
  await harness.provider.ensureAudioContext(22050);

  const status = harness.provider.status();
  assert.equal(status.spatialAudio, true);
  assert.equal(status.spatialProfile, "stage");
  assert.equal(status.spatialAngle, 0);
  assert.equal(status.spatialDistance, 1.0);

  const stage = harness.provider.spatialStage;
  assert.ok(stage);
  assert.equal(stage.pannerNode.panningModel, "equalpower");
  assert.equal(stage.pannerNode.distanceModel, "inverse");
  assert.equal(stage.spatialGain.gain.value, 1.15);
  assert.equal(stage.bypassGain.gain.value, 0.0);
  assert.equal(stage.stereoPanner.pan.value, 0);
  assert.equal(stage.distanceGain.gain.value, 1.0);

  // Perfil padrão: Palco Frontal (0° frente, na tela)
  assert.equal(stage.pannerNode.positionX.value, 0.00);
  assert.equal(stage.pannerNode.positionY.value, 0.15);
  assert.equal(stage.pannerNode.positionZ.value, -1.00);
  assert.equal(stage.clarityFilter.gain.value, 1.86);

  // Alterna para Intérprete (+25° à direita, 1m)
  harness.provider.setSpatialAudio(true, "interpreter");
  assert.equal(stage.pannerNode.positionX.value, 0.42);
  assert.equal(stage.pannerNode.positionY.value, 0.15);
  assert.equal(stage.pannerNode.positionZ.value, -0.91);
  assert.equal(stage.stereoPanner.pan.value, 0.423);
  assert.equal(stage.clarityFilter.gain.value, 1.86);

  // Alterna para Proximidade VIP (+15° direita, 0.6m)
  harness.provider.setSpatialAudio(true, "intimate");
  assert.equal(stage.pannerNode.positionX.value, 0.16);
  assert.equal(stage.pannerNode.positionY.value, 0.15);
  assert.equal(stage.pannerNode.positionZ.value, -0.58);
  assert.equal(stage.stereoPanner.pan.value, 0.259);
  assert.equal(stage.distanceGain.gain.value, 1.18);
  assert.equal(stage.clarityFilter.gain.value, 2.23);

  // Posicionamento contínuo preciso (ex: 45° direita, 1.5m)
  harness.provider.setSpatialPosition(45, 1.5, true);
  assert.equal(stage.pannerNode.positionX.value, 1.06);
  assert.equal(stage.pannerNode.positionY.value, 0.15);
  assert.equal(stage.pannerNode.positionZ.value, -1.06);
  assert.equal(stage.stereoPanner.pan.value, 0.707);
  assert.equal(stage.distanceGain.gain.value, 0.817);

  // Desativa o áudio 3D (modo bypass transparente 1:1)
  harness.provider.setSpatialAudio(false, "intimate");
  assert.equal(stage.pannerNode.positionX.value, 0.00);
  assert.equal(stage.pannerNode.positionY.value, 0.00);
  assert.equal(stage.pannerNode.positionZ.value, -1.00);
  assert.equal(stage.stereoPanner.pan.value, 0);
  assert.equal(stage.spatialGain.gain.value, 0.0);
  assert.equal(stage.bypassGain.gain.value, 1.0);
});

test("atualiza o áudio espacial dinamicamente via SIA_CONFIG_UPDATE", async () => {
  const harness = createHarness();
  harness.provider.setActive("piper-local");
  await harness.provider.ensureAudioContext(22050);

  // Simula mensagem de atualização de perfil vinda do sidepanel/popup
  harness.messages.forEach(fn => {
    fn({ type: "SIA_CONFIG_UPDATE", key: "sia_spatial_profile", value: "interpreter" });
  });
  assert.equal(harness.provider.status().spatialProfile, "interpreter");
  assert.equal(harness.provider.spatialStage.pannerNode.positionX.value, 0.42);

  // Simula atualização contínua de ângulo vinda do radar 3D
  harness.messages.forEach(fn => {
    fn({ type: "SIA_CONFIG_UPDATE", key: "sia_spatial_angle", value: 30 });
  });
  assert.equal(harness.provider.status().spatialAngle, 30);
  assert.equal(harness.provider.spatialStage.pannerNode.positionX.value, 0.5);

  // Simula atualização contínua de distância
  harness.messages.forEach(fn => {
    fn({ type: "SIA_CONFIG_UPDATE", key: "sia_spatial_distance", value: 2.0 });
  });
  assert.equal(harness.provider.status().spatialDistance, 2.0);
  assert.equal(harness.provider.spatialStage.pannerNode.positionX.value, 1.0);

  // Simula desativação do áudio 3D
  harness.messages.forEach(fn => {
    fn({ type: "SIA_CONFIG_UPDATE", key: "sia_spatial_audio", value: false });
  });
  assert.equal(harness.provider.status().spatialAudio, false);
  assert.equal(harness.provider.spatialStage.spatialGain.gain.value, 0.0);
  assert.equal(harness.provider.spatialStage.bypassGain.gain.value, 1.0);
});

