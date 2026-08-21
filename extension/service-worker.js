"use strict";

const OFFSCREEN_PATH = "offscreen.html";
let criandoOffscreen = null;

async function garantirOffscreen() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("API offscreen não disponível neste Chrome");
  }
  if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) return;
  if (criandoOffscreen) return criandoOffscreen;

  criandoOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["WORKERS"],
    justification: "Executar o motor Piper PT-BR local em um Worker isolado da página Coursera."
  }).finally(() => {
    criandoOffscreen = null;
  });
  return criandoOffscreen;
}

async function enviarParaHostNeural(message) {
  await garantirOffscreen();
  return chrome.runtime.sendMessage({
    ...message,
    target: "sia-piper-offscreen"
  });
}

async function enviarParaAbaAtiva(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // O comando fica inativo fora de uma aula compatível.
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "sia-piper-router") return;
  void enviarParaHostNeural(message).then(sendResponse).catch(error => {
    sendResponse({
      ok: false,
      type: "sia-piper-error",
      requestId: message.requestId ?? null,
      message: error?.message || String(error)
    });
  });
  return true;
});

chrome.commands.onCommand.addListener(command => {
  if (command === "replay-last-sentence") {
    void enviarParaAbaAtiva({ type: "SIA_REPLAY_LAST" });
  }
});
