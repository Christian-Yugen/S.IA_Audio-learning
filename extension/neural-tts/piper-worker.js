"use strict";

let ttsInstance = null;
let runtimeState = "loading";
let disposed = false;

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function postError(message, requestId = null, sessionId = null) {
  self.postMessage({
    type: "sia-piper-error",
    requestId,
    sessionId,
    message: String(message || "Falha desconhecida no motor neural")
  });
}

const RUNTIME_ASSETS = self.SIA_PIPER_RUNTIME_ASSETS || {};
const RUNTIME_BASE_URL = self.SIA_PIPER_RUNTIME_BASE_URL
  ? new URL("runtime/", self.SIA_PIPER_RUNTIME_BASE_URL)
  : self.location.protocol === "blob:"
    ? null
    : new URL("runtime/", self.location.href);

self.Module = {
  locateFile(path) {
    const name = String(path || "").split("/").pop();
    if (RUNTIME_ASSETS[path] || RUNTIME_ASSETS[name]) {
      return RUNTIME_ASSETS[path] || RUNTIME_ASSETS[name];
    }
    if (!RUNTIME_BASE_URL) {
      throw new Error(`Asset Piper não fornecido para worker Blob: ${name}`);
    }
    return new URL(path, RUNTIME_BASE_URL).href;
  },
  setStatus(status) {
    self.postMessage({ type: "sia-piper-progress", status: String(status || "") });
  },
  onRuntimeInitialized() {
    try {
      if (disposed) return;
      ttsInstance = createOfflineTts(self.Module);
      runtimeState = "ready";
      self.postMessage({
        type: "sia-piper-ready",
        sampleRate: Number(ttsInstance.sampleRate) || 22050,
        numSpeakers: Number(ttsInstance.numSpeakers) || 1
      });
    } catch (error) {
      runtimeState = "error";
      postError(`Inicialização do Piper falhou: ${errorMessage(error)}`);
    }
  }
};

self.onmessage = event => {
  const message = event.data || {};
  const requestId = message.requestId ?? null;
  const sessionId = message.sessionId ?? null;

  if (message.type === "sia-piper-dispose") {
    disposed = true;
    if (ttsInstance) {
      try {
        ttsInstance.free();
      } catch (error) {
        postError(`Liberação do Piper falhou: ${errorMessage(error)}`, requestId, sessionId);
      }
    }
    ttsInstance = null;
    runtimeState = "disposed";
    self.postMessage({ type: "sia-piper-disposed", requestId, sessionId });
    return;
  }

  if (message.type === "sia-piper-cancel") {
    self.postMessage({ type: "sia-piper-cancelled", requestId, sessionId });
    return;
  }

  if (message.type !== "sia-piper-generate") return;

  if (runtimeState !== "ready" || !ttsInstance) {
    postError("O motor neural ainda não está pronto", requestId, sessionId);
    return;
  }

  const text = String(message.text || "").trim();
  if (!text) {
    postError("Texto vazio não pode ser sintetizado", requestId, sessionId);
    return;
  }

  try {
    const speed = Number.isFinite(Number(message.speed))
      ? Math.min(3.5, Math.max(0.6, Number(message.speed)))
      : 1;
    const sid = Number.isFinite(Number(message.sid))
      ? Math.max(0, Math.trunc(Number(message.sid)))
      : 0;
    const audio = ttsInstance.generate({ text, sid, speed });
    const samples = new Float32Array(audio.samples);
    const sampleRate = Number(audio.sampleRate) || Number(ttsInstance.sampleRate) || 22050;

    self.postMessage(
      {
        type: "sia-piper-result",
        requestId,
        sessionId,
        samples,
        sampleRate,
        durationSeconds: samples.length / sampleRate
      },
      [samples.buffer]
    );
  } catch (error) {
    postError(`Geração neural falhou: ${errorMessage(error)}`, requestId, sessionId);
  }
};

try {
  importScripts(
    RUNTIME_ASSETS["sherpa-onnx-wasm-main-tts.js"]
      || (RUNTIME_BASE_URL && new URL("sherpa-onnx-wasm-main-tts.js", RUNTIME_BASE_URL).href),
    RUNTIME_ASSETS["sherpa-onnx-tts.js"]
      || (RUNTIME_BASE_URL && new URL("sherpa-onnx-tts.js", RUNTIME_BASE_URL).href)
  );
} catch (error) {
  runtimeState = "error";
  postError(`Carregamento do runtime Piper falhou: ${errorMessage(error)}`);
}
