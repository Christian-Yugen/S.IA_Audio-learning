"use strict";

(() => {
  const ENGINE_KEY = "sia_voice_engine";
  const ENGINE_PIPER = "piper-local";
  const ENGINE_BROWSER = "browser";
const WORKER_PATH = "neural-tts/piper-worker.js";
const RUNTIME_PATHS = Object.freeze({
  worker: WORKER_PATH,
  wasmRuntime: "neural-tts/runtime/sherpa-onnx-wasm-main-tts.js",
  ttsRuntime: "neural-tts/runtime/sherpa-onnx-tts.js",
  wasm: "neural-tts/runtime/sherpa-onnx-wasm-main-tts.wasm",
  data: "neural-tts/runtime/sherpa-onnx-wasm-main-tts.data"
});
const READY_TIMEOUT_MS = 30000;
  const GENERATE_TIMEOUT_MS = 20000;
  const MAX_AUDIO_CACHE = 8;

  let active = false;
  let storageReady = false;
  let sequence = 0;

  function isPiperEngine(value) {
    return String(value || "").toLowerCase() === ENGINE_PIPER;
  }

  function abortError(message = "Reprodução neural cancelada") {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  }

  function safeCall(callback, argument) {
    try {
      if (typeof callback === "function") callback(argument);
    } catch (error) {
      console.error("[S·IA Piper] callback de áudio falhou", error);
    }
  }

  class PiperLocalProvider {
    constructor() {
      this.worker = null;
      this.workerBlobUrl = null;
      this.runtimeBlobUrls = [];
      this.workerReady = null;
      this.workerState = "idle";
      this.hostSessionId = `${globalThis.location?.href || "extension-context"}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      this.audioContext = null;
      this.currentSource = null;
      this.currentGain = null;
      this.currentRecord = null;
      this.queue = [];
      this.pending = new Map();
      this.nextRequestId = 1;
      this.audioCache = new Map();
      this.preparing = new Map();
      this.inflight = new Map();
      this.warmupPromise = null;
      this.runtimeWarmed = false;
    }

    isActive() {
      return active;
    }

    setActive(value) {
      const next = isPiperEngine(value) || value === true;
      if (active === next) return;
      active = next;
      if (!active) {
        this.cancel();
      } else {
        // Inicializa o host neural assim que o usuário escolhe o Piper,
        // deixando apenas a geração da frase para o momento da legenda.
        void this.warmUp();
      }
    }

    status() {
      return {
        engine: active ? ENGINE_PIPER : ENGINE_BROWSER,
        state: this.workerState,
        queued: this.queue.length + (this.currentRecord ? 1 : 0),
        ready: this.workerState === "ready"
      };
    }

    async carregarWorkerLocalComoBlob() {
      const urls = {};
      const nomes = Object.keys(RUNTIME_PATHS);
      console.info("[S·IA Piper] carregamento Blob iniciado");
      try {
        for (const nome of nomes) {
          const extensionUrl = chrome.runtime.getURL(RUNTIME_PATHS[nome]);
          const response = await fetch(extensionUrl);
          if (!response.ok) {
            throw new Error(`Não foi possível carregar ${nome} (${response.status})`);
          }
          const conteudo = await response.blob();
          urls[nome] = URL.createObjectURL(conteudo);
          this.runtimeBlobUrls.push(urls[nome]);
          console.info("[S·IA Piper] asset Blob carregado", nome, response.status, conteudo.size);
        }
        const workerSource = await (await fetch(chrome.runtime.getURL(WORKER_PATH))).text();
        const bootstrap = `self.SIA_PIPER_RUNTIME_ASSETS = ${JSON.stringify({
          "sherpa-onnx-wasm-main-tts.js": urls.wasmRuntime,
          "sherpa-onnx-tts.js": urls.ttsRuntime,
          "sherpa-onnx-wasm-main-tts.wasm": urls.wasm,
          "sherpa-onnx-wasm-main-tts.data": urls.data
        })};\n`;
        this.workerBlobUrl = URL.createObjectURL(
          new Blob([bootstrap, workerSource], { type: "text/javascript" })
        );
        console.info("[S·IA Piper] bootstrap Blob pronto");
        return this.workerBlobUrl;
      } catch (error) {
        console.warn("[S·IA Piper] falha ao criar Blob Worker", error);
        Object.values(urls).forEach(url => URL.revokeObjectURL(url));
        this.runtimeBlobUrls = [];
        throw error;
      }
    }

    supportsOffscreenHost() {
      return typeof chrome !== "undefined"
        && typeof chrome.runtime?.sendMessage === "function"
        && typeof chrome.runtime?.getURL === "function";
    }

    async createOffscreenWorker() {
      if (this.worker) return this.worker;
      this.workerState = "loading";
      let terminated = false;
      const proxy = {
        onmessage: null,
        onerror: null,
        postMessage: payload => {
          if (terminated) return;
          const commandByType = {
            "sia-piper-init": "init",
            "sia-piper-generate": "generate",
            "sia-piper-cancel": "cancel",
            "sia-piper-dispose": "dispose"
          };
          const command = commandByType[payload?.type];
          if (!command) return;
          Promise.resolve(chrome.runtime.sendMessage({
            target: "sia-piper-router",
            command,
            sessionId: this.hostSessionId,
            ...payload
          })).then(response => {
            if (terminated || !response) return;
            if (response.type) {
              proxy.onmessage?.({ data: response });
            } else if (response.ok === false) {
              proxy.onerror?.({ message: response.message || "Falha no host neural" });
            }
          }).catch(error => {
            if (!terminated) proxy.onerror?.({ message: error?.message || String(error) });
          });
        },
        terminate: () => {
          if (terminated) return;
          terminated = true;
          void chrome.runtime.sendMessage({
            target: "sia-piper-router",
            command: "dispose",
            sessionId: this.hostSessionId
          }).catch(() => {});
        }
      };
      this.worker = proxy;
      this.workerReady = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Tempo excedido ao carregar a voz neural"));
        }, READY_TIMEOUT_MS);

        proxy.onmessage = event => {
          const message = event.data || {};
          if (message.type === "sia-piper-ready") {
            clearTimeout(timeout);
            this.workerState = "ready";
            resolve(message);
            return;
          }
          if (message.type === "sia-piper-result") {
            this.resolvePending(message);
            return;
          }
          if (message.type === "sia-piper-error") {
            if (message.requestId !== null && message.requestId !== undefined) {
              this.rejectPending(message.requestId, new Error(message.message));
            } else {
              clearTimeout(timeout);
              this.workerState = "error";
              reject(new Error(message.message));
            }
          }
        };
        proxy.onerror = event => {
          clearTimeout(timeout);
          this.workerState = "error";
          reject(new Error(event?.message || "Falha no host neural Piper"));
        };
      }).catch(error => {
        this.workerState = "error";
        this.disposeWorker();
        throw error;
      });
      proxy.postMessage({ type: "sia-piper-init" });
      return proxy;
    }

    async createWorker() {
      if (this.supportsOffscreenHost()) {
        return this.createOffscreenWorker();
      }
      return this.createLocalWorker();
    }

    async createLocalWorker() {
      if (this.worker) return this.worker;
      if (typeof Worker !== "function") {
        throw new Error("Web Worker indisponível neste navegador");
      }

      const workerUrl = chrome.runtime.getURL(WORKER_PATH);
      this.workerState = "loading";
      let worker;
      try {
        worker = new Worker(workerUrl);
      } catch (error) {
        if (error?.name !== "SecurityError") throw error;
        console.info("[S·IA Piper] Worker direto bloqueado; usando Blob", error.message);
        const blobUrl = await this.carregarWorkerLocalComoBlob();
        worker = new Worker(blobUrl);
      }
      this.worker = worker;
      this.workerReady = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Tempo excedido ao carregar a voz neural"));
        }, READY_TIMEOUT_MS);

        worker.onmessage = event => {
          const message = event.data || {};
          if (message.type === "sia-piper-progress") return;

          if (message.type === "sia-piper-ready") {
            clearTimeout(timeout);
            this.workerState = "ready";
            resolve(message);
            return;
          }

          if (message.type === "sia-piper-result") {
            this.resolvePending(message);
            return;
          }

          if (message.type === "sia-piper-error") {
            if (message.requestId !== null && message.requestId !== undefined) {
              this.rejectPending(message.requestId, new Error(message.message));
            } else {
              clearTimeout(timeout);
              this.workerState = "error";
              reject(new Error(message.message));
            }
          }
        };

        worker.onerror = event => {
          clearTimeout(timeout);
          this.workerState = "error";
          reject(new Error(event?.message || "Falha no Worker Piper"));
        };
      }).catch(error => {
        this.workerState = "error";
        this.disposeWorker();
        throw error;
      });

      return worker;
    }

    async ensureReady() {
      if (this.workerState === "ready" && this.worker) return;
      await this.createWorker();
      await this.workerReady;
    }

    async warmUp() {
      if (!active) return false;
      if (this.runtimeWarmed) return true;
      if (this.warmupPromise) return this.warmupPromise;

      this.warmupPromise = (async () => {
        await this.ensureReady();
        if (!active) return false;
        this.runtimeWarmed = true;
        return true;
      })()
        .catch(error => {
          if (error?.name !== "AbortError") {
            console.info("[S·IA Piper] aquecimento neural não concluído", error?.message || error);
          }
          return false;
        })
        .finally(() => {
          this.warmupPromise = null;
        });
      return this.warmupPromise;
    }

    async ensureAudioContext(sampleRate) {
      if (!this.audioContext) {
        const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (typeof AudioContextCtor !== "function") {
          throw new Error("AudioContext indisponível neste navegador");
        }
        try {
          this.audioContext = new AudioContextCtor({ sampleRate });
        } catch {
          this.audioContext = new AudioContextCtor();
        }
      }
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      return this.audioContext;
    }

    async primeAudio(sampleRate = 22050) {
      try {
        const context = await this.ensureAudioContext(sampleRate);
        if (context.state !== "running") {
          this.workerState = "audio-blocked";
          return {
            ok: false,
            state: context.state,
            message: "o Chrome ainda não liberou o áudio; clique na página e tente novamente"
          };
        }
        return { ok: true, state: context.state, sampleRate: context.sampleRate };
      } catch (error) {
        this.workerState = "audio-error";
        return { ok: false, message: error?.message || "AudioContext indisponível" };
      }
    }

    cacheKey(utterance) {
      return [
        String(utterance.text || ""),
        Number(utterance.rate || 1).toFixed(3),
        Number(utterance.voice?.voiceURI || 0)
      ].join("|");
    }

    rememberAudio(key, audio) {
      this.audioCache.delete(key);
      this.audioCache.set(key, audio);
      while (this.audioCache.size > MAX_AUDIO_CACHE) {
        this.audioCache.delete(this.audioCache.keys().next().value);
      }
    }

    async generate(utterance, token) {
      const key = this.cacheKey(utterance);
      const cached = this.audioCache.get(key);
      if (cached) return cached;
      if (this.inflight.has(key)) return this.inflight.get(key);

      const promise = this.generateUncached(utterance, token)
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, promise);
      return promise;
    }

    async generateUncached(utterance, token) {
      const key = this.cacheKey(utterance);
      await this.ensureReady();
      if (token !== sequence || !active) throw abortError();

      const requestId = this.nextRequestId++;
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pending.delete(requestId);
          reject(new Error("Tempo excedido na geração da voz neural"));
        }, GENERATE_TIMEOUT_MS);
        this.pending.set(requestId, { resolve, reject, timeout });
        this.worker.postMessage({
          type: "sia-piper-generate",
          requestId,
          text: String(utterance.text || ""),
          sid: 0,
          speed: Number(utterance.rate) || 1
        });
      });

      if (token !== sequence || !active) throw abortError();
      this.rememberAudio(key, result);
      return result;
    }

    primeText(utterance) {
      if (!active || !utterance?.text) return Promise.resolve(false);
      const key = this.cacheKey(utterance);
      if (this.audioCache.has(key)) return Promise.resolve(true);
      if (this.preparing.has(key)) return this.preparing.get(key);

      const token = sequence;
      const promise = this.generate(utterance, token)
        .then(() => true)
        .catch(error => {
          if (error?.name !== "AbortError") {
            console.info("[S·IA Piper] pré-carregamento não concluído", error?.message || error);
          }
          return false;
        })
        .finally(() => this.preparing.delete(key));
      this.preparing.set(key, promise);
      return promise;
    }

    resolvePending(message) {
      const item = this.pending.get(message.requestId);
      if (!item) return;
      clearTimeout(item.timeout);
      this.pending.delete(message.requestId);
      item.resolve({
        samples: message.samples instanceof Float32Array
          ? message.samples
          : new Float32Array(message.samples),
        sampleRate: Number(message.sampleRate) || 22050,
        durationSeconds: Number(message.durationSeconds) || 0
      });
    }

    rejectPending(requestId, error) {
      const item = this.pending.get(requestId);
      if (!item) return;
      clearTimeout(item.timeout);
      this.pending.delete(requestId);
      item.reject(error);
    }

    speak(utterance) {
      if (!active) return false;
      this.queue.push({ utterance, token: sequence });
      void this.processQueue();
      return true;
    }

    async processQueue() {
      if (this.currentRecord || !this.queue.length || !active) return;
      const record = this.queue.shift();
      this.currentRecord = record;
      const token = record.token;

      try {
        const audio = await this.generate(record.utterance, token);
        if (token !== sequence || !active || this.currentRecord !== record) {
          return;
        }

        const context = await this.ensureAudioContext(audio.sampleRate);
        if (context.state !== "running") {
          throw new Error("AudioContext bloqueado; interaja com a página antes de iniciar a leitura");
        }
        if (!audio.samples?.length) {
          throw new Error("O Piper retornou áudio vazio");
        }
        const sampleRate = Number(audio.sampleRate);
        if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
          throw new Error(`Taxa de áudio inválida: ${audio.sampleRate}`);
        }
        const buffer = context.createBuffer(1, audio.samples.length, sampleRate);
        buffer.getChannelData(0).set(audio.samples);

        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        gain.gain.value = Math.min(1, Math.max(0, Number(record.utterance.volume) || 1));

        const pitch = Number(record.utterance.pitch) || 1;
        if (pitch > 0 && pitch !== 1 && "detune" in source) {
          source.detune.value = 1200 * Math.log2(pitch);
        }

        source.connect(gain);
        gain.connect(context.destination);
        this.currentSource = source;
        this.currentGain = gain;

        source.onended = () => {
          if (this.currentRecord !== record) return;
          this.currentSource = null;
          this.currentGain = null;
          this.currentRecord = null;
          safeCall(record.utterance.onend);
          void this.processQueue();
        };

        source.start();
        safeCall(record.utterance.onstart);
      } catch (error) {
        if (token !== sequence || error?.name === "AbortError") return;
        this.currentSource = null;
        this.currentGain = null;
        this.currentRecord = null;
        const detail = `[${error?.name || "AudioError"}] ${error?.message || String(error)}`;
        this.deactivateAfterFailure(new Error(detail));
        safeCall(record.utterance.onerror, { error: "piper-fallback", message: detail });
        void this.processQueue();
      }
    }

    cancel() {
      sequence += 1;
      this.queue.length = 0;
      this.pending.forEach(item => {
        clearTimeout(item.timeout);
        item.reject(abortError());
      });
      this.pending.clear();

      if (this.currentSource) {
        try {
          this.currentSource.onended = null;
          this.currentSource.stop();
        } catch {
          // A fonte já pode ter terminado naturalmente.
        }
      }
      this.currentSource = null;
      this.currentGain = null;
      this.currentRecord = null;
    }

    disposeWorker() {
      if (this.worker) {
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.worker.terminate();
      }
      this.worker = null;
      this.workerReady = null;
      if (this.workerBlobUrl) {
        URL.revokeObjectURL(this.workerBlobUrl);
        this.workerBlobUrl = null;
      }
      this.runtimeBlobUrls.forEach(url => URL.revokeObjectURL(url));
      this.runtimeBlobUrls = [];
      this.workerState = "idle";
      this.runtimeWarmed = false;
      this.warmupPromise = null;
    }

    deactivateAfterFailure(error) {
      console.info("[S·IA Piper] fallback para voz do navegador", error);
      active = false;
      this.cancel();
      this.disposeWorker();
      try {
        void chrome.storage.local.set({ [ENGINE_KEY]: ENGINE_BROWSER });
      } catch {
        // O fallback em memória continua válido se o armazenamento falhar.
      }
    }
  }

  const provider = new PiperLocalProvider();
  globalThis.SiaPiperVoice = provider;

  chrome.storage.local.get(ENGINE_KEY, result => {
    storageReady = true;
    provider.setActive(result[ENGINE_KEY]);
  });

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "SIA_CONFIG_UPDATE" && message.key === ENGINE_KEY) {
      provider.setActive(message.value);
    }
  });

  globalThis.SiaPiperVoiceStatus = () => ({
    ...provider.status(),
    storageReady
  });

  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("pagehide", () => {
      provider.cancel();
      provider.disposeWorker();
    }, { once: true });
  }

  const primeFromPageGesture = () => {
    if (!provider.isActive()) return;
    void provider.primeAudio().then(result => {
      if (!result.ok) {
        console.info("[S·IA Piper] áudio ainda bloqueado", result.message);
      }
    });
  };
  if (typeof globalThis.addEventListener === "function") {
    ["pointerdown", "keydown", "touchstart"].forEach(type => {
      globalThis.addEventListener(type, primeFromPageGesture, {
        capture: true,
        passive: true
      });
    });
  }
})();
