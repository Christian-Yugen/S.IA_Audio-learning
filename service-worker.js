"use strict";

async function enviarParaAbaAtiva(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // O comando fica inativo fora de uma aula compatível.
  }
}

chrome.commands.onCommand.addListener(command => {
  if (command === "replay-last-sentence") {
    void enviarParaAbaAtiva({ type: "SIA_REPLAY_LAST" });
  }
});
