"use strict";

const WORKER_URL = chrome.runtime.getURL("neural-tts/piper-worker.js");
let worker = null;
let workerReady = null;
let workerState = "idle";
const pending = new Map();

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Falha desconhecida");
}

function disposeWorker() {
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
  worker = null;
  workerReady = null;
  workerState = "idle";
  pending.forEach(item => item.reject(new Error("Host neural encerrado")));
  pending.clear();
}

function rejectPending(requestId, error) {
  const item = pending.get(requestId);
  if (!item) return;
  pending.delete(requestId);
  item.reject(error);
}

function resolvePending(message) {
  const item = pending.get(message.requestId);
  if (!item) return;
  pending.delete(message.requestId);
  item.resolve(message);
}

async function ensureWorker() {
  if (worker && workerReady) return workerReady;
  if (typeof Worker !== "function") {
    throw new Error("Web Worker indisponível no host offscreen");
  }

  workerState = "loading";
  worker = new Worker(WORKER_URL);
  workerReady = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Tempo excedido ao iniciar o host Piper"));
    }, 60000);

    worker.onmessage = event => {
      const message = event.data || {};
      if (message.type === "sia-piper-progress") return;
      if (message.type === "sia-piper-ready") {
        clearTimeout(timeout);
        workerState = "ready";
        resolve(message);
        return;
      }
      if (message.type === "sia-piper-result") {
        resolvePending(message);
        return;
      }
      if (message.type === "sia-piper-error") {
        if (message.requestId !== null && message.requestId !== undefined) {
          rejectPending(message.requestId, new Error(message.message));
        } else {
          clearTimeout(timeout);
          workerState = "error";
          reject(new Error(message.message));
        }
      }
    };

    worker.onerror = event => {
      clearTimeout(timeout);
      workerState = "error";
      reject(new Error(event?.message || "Falha no Worker Piper"));
    };
  }).catch(error => {
    workerState = "error";
    disposeWorker();
    throw error;
  });

  return workerReady;
}

async function execute(message) {
  if (message.command === "dispose") {
    disposeWorker();
    return { ok: true, type: "sia-piper-disposed", requestId: message.requestId ?? null };
  }

  await ensureWorker();
  if (message.command === "init") {
    const ready = await workerReady;
    return {
      ok: true,
      type: "sia-piper-ready",
      sampleRate: ready.sampleRate,
      numSpeakers: ready.numSpeakers,
      state: workerState
    };
  }

  if (message.command === "cancel") {
    worker.postMessage({ type: "sia-piper-cancel", requestId: message.requestId ?? null });
    return { ok: true, type: "sia-piper-cancelled", requestId: message.requestId ?? null };
  }

  if (message.command === "generate") {
    const requestId = message.requestId;
    if (requestId === null || requestId === undefined) {
      throw new Error("requestId ausente na geração Piper");
    }
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("Tempo excedido na geração da voz neural"));
      }, 90000);
      pending.set(requestId, {
        resolve: message => {
          clearTimeout(timeout);
          resolve(message);
        },
        reject: error => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      worker.postMessage({
        type: "sia-piper-generate",
        requestId,
        text: String(message.text || ""),
        sid: Number(message.sid) || 0,
        speed: Number(message.speed) || 1
      });
    });
    const serializableResult = {
      ...result,
      samples: Array.from(result.samples || [])
    };
    return serializableResult;
  }

  throw new Error(`Comando neural desconhecido: ${message.command}`);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "sia-piper-offscreen") return;
  void execute(message).then(sendResponse).catch(error => {
    sendResponse({
      ok: false,
      type: "sia-piper-error",
      requestId: message.requestId ?? null,
      message: errorMessage(error),
      state: workerState
    });
  });
  return true;
});
