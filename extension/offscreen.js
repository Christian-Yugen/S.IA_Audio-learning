"use strict";

const WORKER_URL = chrome.runtime.getURL("neural-tts/piper-worker.js");
let worker = null;
let workerReady = null;
let workerState = "idle";
const pending = new Map();
const activeSessions = new Set();

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Falha desconhecida");
}

function normalizeSessionId(value) {
  const sessionId = String(value || "").trim();
  if (!sessionId) throw new Error("sessionId ausente no host neural");
  return sessionId;
}

function pendingKey(sessionId, requestId) {
  return `${sessionId}\u0000${String(requestId)}`;
}

function rejectPendingForSession(sessionId, error) {
  for (const [key, item] of pending) {
    if (item.sessionId !== sessionId) continue;
    pending.delete(key);
    item.reject(error);
  }
}

function disposeWorker(reason = "Host neural encerrado") {
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
  worker = null;
  workerReady = null;
  workerState = "idle";
  pending.forEach(item => item.reject(new Error(reason)));
  pending.clear();
}

function rejectPending(sessionId, requestId, error) {
  const key = pendingKey(sessionId, requestId);
  const item = pending.get(key);
  if (!item) return;
  pending.delete(key);
  item.reject(error);
}

function resolvePending(message) {
  const sessionId = String(message.sessionId || "");
  const key = pendingKey(sessionId, message.requestId);
  const item = pending.get(key);
  if (!item) return;
  pending.delete(key);
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
          rejectPending(
            String(message.sessionId || ""),
            message.requestId,
            new Error(message.message)
          );
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
      reject(new Error(event?.message || "Falha no host Piper"));
    };
  }).catch(error => {
    workerState = "error";
    disposeWorker();
    throw error;
  });

  return workerReady;
}

async function execute(message) {
  const sessionId = normalizeSessionId(message.sessionId);

  if (message.command === "dispose") {
    activeSessions.delete(sessionId);
    rejectPendingForSession(sessionId, new Error("Sessão neural encerrada"));
    if (activeSessions.size === 0) disposeWorker();
    return {
      ok: true,
      type: "sia-piper-disposed",
      sessionId,
      requestId: message.requestId ?? null
    };
  }

  activeSessions.add(sessionId);
  await ensureWorker();

  if (message.command === "init") {
    const ready = await workerReady;
    return {
      ok: true,
      type: "sia-piper-ready",
      sessionId,
      sampleRate: ready.sampleRate,
      numSpeakers: ready.numSpeakers,
      state: workerState
    };
  }

  if (message.command === "cancel") {
    worker.postMessage({
      type: "sia-piper-cancel",
      sessionId,
      requestId: message.requestId ?? null
    });
    return {
      ok: true,
      type: "sia-piper-cancelled",
      sessionId,
      requestId: message.requestId ?? null
    };
  }

  if (message.command === "generate") {
    const requestId = message.requestId;
    if (requestId === null || requestId === undefined) {
      throw new Error("requestId ausente na geração Piper");
    }
    const key = pendingKey(sessionId, requestId);
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(key);
        reject(new Error("Tempo excedido na geração da voz neural"));
      }, 90000);
      pending.set(key, {
        sessionId,
        resolve: resultMessage => {
          clearTimeout(timeout);
          resolve(resultMessage);
        },
        reject: error => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      worker.postMessage({
        type: "sia-piper-generate",
        sessionId,
        requestId,
        text: String(message.text || ""),
        sid: Number(message.sid) || 0,
        speed: Number(message.speed) || 1
      });
    });
    const serializableResult = {
      ...result,
      sessionId,
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
      sessionId: message.sessionId ?? null,
      requestId: message.requestId ?? null,
      message: errorMessage(error),
      state: workerState
    });
  });
  return true;
});
