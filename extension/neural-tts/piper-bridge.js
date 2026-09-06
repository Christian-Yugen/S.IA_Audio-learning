"use strict";

(() => {
  const ENGINE_KEY = "sia_voice_engine";
  const ENGINE_PIPER = "piper-local";
  const ENGINE_BROWSER = "browser";
  const SPATIAL_KEY = "sia_spatial_audio";
  const SPATIAL_PROFILE_KEY = "sia_spatial_profile";

  const SPATIAL_PROFILES = Object.freeze({
    interpreter: Object.freeze({
      name: "Intérprete Particular",
      x: 0.42,
      y: 0.09,
      z: -0.91,
      reverbWet: 0.08
    }),
    stage: Object.freeze({
      name: "Palco Frontal",
      x: 0.00,
      y: 0.28,
      z: -1.58,
      reverbWet: 0.12
    }),
    intimate: Object.freeze({
      name: "Proximidade VIP",
      x: 0.16,
      y: 0.00,
      z: -0.58,
      reverbWet: 0.05
    })
  });

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
  const AUDIO_RESUME_TIMEOUT_MS = 1200;
  const MAX_AUDIO_CACHE = 8;

  let active = false;
  let storageReady = false;
  let sequence = 0;

  function isPiperEngine(value) {
    return String(value || "").toLowerCase() === ENGINE_PIPER;
  }

  function safeSendMessage(payload) {
    try {
      if (typeof chrome === "undefined" || !chrome?.runtime?.id || typeof chrome.runtime?.sendMessage !== "function") {
        return Promise.resolve(null);
      }
      const promise = chrome.runtime.sendMessage(payload);
      if (promise && typeof promise?.catch === "function") {
        return promise.catch(() => null);
      }
      return Promise.resolve(null);
    } catch {
      return Promise.resolve(null);
    }
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

  class SiaSpatialStage {
    constructor(audioContext) {
      this.context = audioContext;
      this.enabled = true;
      this.profileKey = "interpreter";
      this.input = null;
      this.output = null;
      this.pannerNode = null;
      this.convolverNode = null;
      this.reverbGain = null;
      this.directGain = null;
      this.initNodes();
    }

    initNodes() {
      if (!this.context) return;
      try {
        this.input = typeof this.context.createGain === "function" ? this.context.createGain() : null;
        this.output = typeof this.context.createGain === "function" ? this.context.createGain() : null;

        if (typeof this.context.createPanner === "function") {
          this.pannerNode = this.context.createPanner();
          this.pannerNode.panningModel = "HRTF";
          this.pannerNode.distanceModel = "inverse";
          this.pannerNode.refDistance = 1;
          this.pannerNode.maxDistance = 10000;
          this.pannerNode.rolloffFactor = 1;
          this.pannerNode.coneInnerAngle = 360;
        }

        if (typeof this.context.createConvolver === "function") {
          const impulse = this.generateStudioImpulse();
          if (impulse) {
            this.convolverNode = this.context.createConvolver();
            this.convolverNode.buffer = impulse;
          }
        }

        if (typeof this.context.createGain === "function") {
          this.directGain = this.context.createGain();
          this.reverbGain = this.context.createGain();
        }

        this.applyProfile(this.profileKey, this.enabled);
        this.connectNodes();
      } catch (err) {
        console.warn("[S·IA Spatial Stage] inicialização fallback", err);
      }
    }

    generateStudioImpulse() {
      if (!this.context || typeof this.context.createBuffer !== "function") return null;
      try {
        const rate = Number(this.context.sampleRate) || 44100;
        const length = Math.floor(rate * 0.045);
        const buffer = this.context.createBuffer(2, length, rate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        const decay = 0.018;

        for (let i = 0; i < length; i++) {
          const t = i / rate;
          const envelope = Math.exp(-t / decay);
          left[i] = (Math.random() * 2 - 1) * envelope * 0.5;
          right[i] = (Math.random() * 2 - 1) * envelope * 0.5;
        }
        return buffer;
      } catch {
        return null;
      }
    }

    applyProfile(profileKey, enabled = true) {
      this.profileKey = SPATIAL_PROFILES[profileKey] ? profileKey : "interpreter";
      this.enabled = Boolean(enabled);
      const config = SPATIAL_PROFILES[this.profileKey];

      if (!this.pannerNode) return;

      const currentTime = Number(this.context?.currentTime) || 0;

      if (!this.enabled) {
        if (this.pannerNode.positionX?.setValueAtTime) {
          this.pannerNode.positionX.setValueAtTime(0, currentTime);
          this.pannerNode.positionY.setValueAtTime(0, currentTime);
          this.pannerNode.positionZ.setValueAtTime(-1, currentTime);
        } else if (typeof this.pannerNode.setPosition === "function") {
          this.pannerNode.setPosition(0, 0, -1);
        }
        if (this.reverbGain?.gain) {
          this.reverbGain.gain.value = 0;
        }
        if (this.directGain?.gain) {
          this.directGain.gain.value = 1.0;
        }
        return;
      }

      if (this.pannerNode.positionX?.setValueAtTime) {
        this.pannerNode.positionX.setValueAtTime(config.x, currentTime);
        this.pannerNode.positionY.setValueAtTime(config.y, currentTime);
        this.pannerNode.positionZ.setValueAtTime(config.z, currentTime);
      } else if (typeof this.pannerNode.setPosition === "function") {
        this.pannerNode.setPosition(config.x, config.y, config.z);
      }

      if (this.reverbGain?.gain) {
        this.reverbGain.gain.value = config.reverbWet;
      }
      if (this.directGain?.gain) {
        this.directGain.gain.value = 1.0;
      }
    }

    connectNodes() {
      if (!this.input || !this.output) return;
      try {
        if (this.pannerNode) {
          this.input.connect(this.pannerNode);

          if (this.directGain) {
            this.pannerNode.connect(this.directGain);
            this.directGain.connect(this.output);
          } else {
            this.pannerNode.connect(this.output);
          }

          if (this.convolverNode && this.reverbGain) {
            this.pannerNode.connect(this.convolverNode);
            this.convolverNode.connect(this.reverbGain);
            this.reverbGain.connect(this.output);
          }
        } else {
          this.input.connect(this.output);
        }
      } catch {
        try { this.input.connect(this.output); } catch {}
      }
    }
  }

  class PiperLocalProvider {
    constructor() {
      this.worker = null;
      this.workerBlobUrl = null;
      this.runtimeBlobUrls = [];
      this.workerReady = null;
      this.workerState = "idle";
      this.audioState = "idle";
      this.audioError = "";
      this.hostSessionId = `${globalThis.location?.href || "extension-context"}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      this.audioContext = null;
      this.currentSource = null;
      this.currentGain = null;
      this.currentRecord = null;
      this.queue = [];
      this.processing = false;
      this.pending = new Map();
      this.nextRequestId = 1;
      this.audioCache = new Map();
      this.preparing = new Map();
      this.inflight = new Map();
      this.warmupPromise = null;
      this.runtimeWarmed = false;
      this.spatialEnabled = true;
      this.spatialProfile = "interpreter";
      this.spatialStage = null;
    }

    isActive() {
      return active;
    }

    setActive(value) {
      const next = isPiperEngine(value) || value === true;
      if (active === next) return;
      active = next;
      if (!active) {
        this.audioState = "idle";
        this.audioError = "";
        this.cancel();
      } else {
        this.audioState = "awaiting-gesture";
        this.audioError = "";
        // O host neural pode ser aquecido sem reproduzir áudio. O AudioContext
        // só deve ser criado/retomado após um gesto real na página; tentar
        // primeAudio aqui ocorre fora da ativação do usuário e dispara a
        // política de autoplay do Chrome.
        void this.warmUp();
      }
    }

    status() {
      return {
        engine: active ? ENGINE_PIPER : ENGINE_BROWSER,
        state: this.workerState,
        queued: this.queue.length + (this.currentRecord ? 1 : 0),
        ready: this.workerState === "ready",
        audioState: this.audioState,
        audioError: this.audioError,
        spatialAudio: this.spatialEnabled,
        spatialProfile: this.spatialProfile
      };
    }

    setSpatialAudio(enabled, profile) {
      if (typeof enabled === "boolean") {
        this.spatialEnabled = enabled;
      }
      if (typeof profile === "string" && profile) {
        this.spatialProfile = profile;
      }
      if (this.spatialStage) {
        this.spatialStage.applyProfile(this.spatialProfile, this.spatialEnabled);
      }
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
      try {
        return typeof chrome !== "undefined"
          && Boolean(chrome.runtime?.id)
          && typeof chrome.runtime?.sendMessage === "function"
          && typeof chrome.runtime?.getURL === "function";
      } catch {
        return false;
      }
    }

    async createOffscreenWorker() {
      if (this.worker) return this.worker;
      this.workerState = "loading";
      let terminated = false;
      const proxy = {
        onmessage: null,
        onerror: null,
        postMessage: payload => {
          if (terminated || !chrome?.runtime?.id) return;
          const commandByType = {
            "sia-piper-init": "init",
            "sia-piper-generate": "generate",
            "sia-piper-cancel": "cancel",
            "sia-piper-dispose": "dispose"
          };
          const command = commandByType[payload?.type];
          if (!command) return;
          safeSendMessage({
            target: "sia-piper-router",
            command,
            sessionId: this.hostSessionId,
            ...payload
          }).then(response => {
            if (terminated || !response) return;
            if (response.type) {
              proxy.onmessage?.({ data: response });
            } else if (response.ok === false) {
              proxy.onerror?.({ message: response.message || "Falha no host neural" });
            }
          }).catch(error => {
            if (!terminated && !/context invalidated/i.test(error?.message || "")) {
              proxy.onerror?.({ message: error?.message || String(error) });
            }
          });
        },
        terminate: () => {
          if (terminated) return;
          terminated = true;
          void safeSendMessage({
            target: "sia-piper-router",
            command: "dispose",
            sessionId: this.hostSessionId
          });
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
      if (!this.spatialStage && this.audioContext) {
        this.spatialStage = new SiaSpatialStage(this.audioContext);
        this.spatialStage.applyProfile(this.spatialProfile, this.spatialEnabled);
        if (this.spatialStage.output) {
          try {
            this.spatialStage.output.connect(this.audioContext.destination);
          } catch {}
        }
      }
      if (this.audioContext.state === "suspended") {
        let resumeTimer = 0;
        try {
          const resumePromise = this.audioContext.resume();
          await Promise.race([
            Promise.resolve(resumePromise),
            new Promise((_, reject) => {
              resumeTimer = setTimeout(() => {
                const error = new Error("AudioContext bloqueado; interaja com a página antes de iniciar a leitura");
                error.name = "NotAllowedError";
                reject(error);
              }, AUDIO_RESUME_TIMEOUT_MS);
            })
          ]);
        } catch (error) {
          const detail = String(error?.message || error || "");
          if (/not.?allowed|audio.?context.*(gesture|interaja|bloqueado)|user.?gesture|bloqueado/i.test(`${error?.name || ""} ${detail}`)) {
            this.audioState = "blocked";
            this.audioError = "O Chrome ainda não liberou o áudio; clique na página da aula e tente novamente";
            return this.audioContext;
          }
          throw error;
        } finally {
          if (resumeTimer) clearTimeout(resumeTimer);
        }
      }
      return this.audioContext;
    }

    async primeAudio(sampleRate = 22050) {
      try {
        const context = await this.ensureAudioContext(sampleRate);
        if (context.state !== "running") {
          this.audioState = "blocked";
          this.audioError = "o Chrome ainda não liberou o áudio; clique na página e tente novamente";
          return {
            ok: false,
            state: context.state,
            message: this.audioError
          };
        }
        this.audioState = "running";
        this.audioError = "";
        if (this.queue.length && !this.currentRecord) void this.processQueue();
        return { ok: true, state: context.state, sampleRate: context.sampleRate };
      } catch (error) {
        this.audioState = "blocked";
        this.audioError = error?.message || "AudioContext indisponível";
        return { ok: false, message: this.audioError };
      }
    }

    cacheKey(utterance) {
      return [
        String(utterance.text || ""),
        Number(utterance.rate || 1).toFixed(3),
        Number(utterance.silenceScale ?? 0.2).toFixed(3),
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
          speed: Number(utterance.rate) || 1,
          silenceScale: Number(utterance.silenceScale ?? 0.2)
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
      const token = sequence;
      // Mantém na fila as legendas para transição fluida e contínua sem corte de palavras.
      // Se a fala atual ainda está em andamento, a nova aguarda sua conclusão natural.
      this.queue.push({ utterance, token });
      while (this.queue.length > 2) {
        const dropped = this.queue.shift();
        safeCall(dropped.utterance?.onend);
      }
      // Inicia imediatamente a pré-síntese no Web Worker em segundo plano.
      // Mesmo enquanto a frase anterior ainda estiver tocando no AudioContext,
      // o Worker já sintetiza as amostras de áudio da próxima frase em paralelo.
      // Quando a anterior terminar, a próxima frase já estará pronta no cache (latência zero).
      void this.generate(utterance, token).catch(() => {});
      void this.processQueue();
      return true;
    }

    async processQueue() {
      if (this.currentRecord || this.processing || !this.queue.length || !active) return;
      this.processing = true;
      const record = this.queue.shift();
      const token = record.token;

      try {
        const audio = await this.generate(record.utterance, token);
        if (token !== sequence || !active) {
          this.processing = false;
          return;
        }

        let context;
        try {
          context = await this.ensureAudioContext(audio.sampleRate);
        } catch (error) {
          const detail = String(error?.message || error || "");
          if (/audio.?context|not.?allowed|bloqueado|blocked/i.test(`${error?.name || ""} ${detail}`)) {
            this.audioState = "blocked";
            this.audioError = detail || "AudioContext bloqueado; interaja com a página antes de iniciar a leitura";
            this.queue.unshift(record);
            this.processing = false;
            setTimeout(() => {
              if (active && this.queue.length && !this.currentRecord) void this.processQueue();
            }, 250);
            return;
          }
          throw error;
        }
        if (context.state !== "running") {
          this.audioState = "blocked";
          this.audioError = "AudioContext bloqueado; interaja com a página antes de iniciar a leitura";
          this.queue.unshift(record);
          this.processing = false;
          const retry = () => {
            if (active && this.queue.length && !this.currentRecord) void this.processQueue();
          };
          if (typeof window !== "undefined") {
            window.addEventListener("pointerdown", retry, { once: true });
            window.addEventListener("keydown", retry, { once: true });
          }
          setTimeout(retry, 250);
          return;
        }
        this.audioState = "running";
        this.audioError = "";
        if (!audio.samples?.length) {
          throw new Error("O Piper retornou áudio vazio");
        }
        const sampleRate = Number(audio.sampleRate);
        if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
          throw new Error(`Taxa de áudio inválida: ${audio.sampleRate}`);
        }

        // Se uma fonte órfã anterior persistir sem registro ativo, limpa com segurança.
        if (this.currentSource && !this.currentRecord) {
          try {
            this.currentSource.onended = null;
            this.currentSource.stop();
          } catch {
            // A fonte já pode ter terminado.
          }
          this.currentSource = null;
          this.currentGain = null;
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
        if (this.spatialStage && this.spatialStage.input) {
          gain.connect(this.spatialStage.input);
        } else {
          gain.connect(context.destination);
        }
        this.currentSource = source;
        this.currentGain = gain;
        this.currentRecord = record;
        this.processing = false;

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
        this.processing = false;
        const detailText = String(error?.message || error || "");
        if (/audio.?context|not.?allowed|bloqueado|blocked/i.test(`${error?.name || ""} ${detailText}`)) {
          this.audioState = "blocked";
          this.audioError = detailText || "AudioContext bloqueado; interaja com a página antes de iniciar a leitura";
          if (token === sequence && active && !this.currentRecord) {
            this.queue.unshift(record);
          }
          return;
        }
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
      this.processing = false;
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
      this.audioState = active ? "awaiting-gesture" : "idle";
      this.audioError = "";
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

  chrome.storage.local.get([ENGINE_KEY, SPATIAL_KEY, SPATIAL_PROFILE_KEY], result => {
    storageReady = true;
    provider.setActive(result[ENGINE_KEY]);
    provider.setSpatialAudio(
      result[SPATIAL_KEY] !== false,
      result[SPATIAL_PROFILE_KEY] || "interpreter"
    );
  });

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "SIA_CONFIG_UPDATE") {
      if (message.key === ENGINE_KEY) {
        provider.setActive(message.value);
      } else if (message.key === SPATIAL_KEY) {
        provider.setSpatialAudio(message.value, provider.spatialProfile);
      } else if (message.key === SPATIAL_PROFILE_KEY) {
        provider.setSpatialAudio(provider.spatialEnabled, message.value);
      }
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
