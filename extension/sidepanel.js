(() => {
  "use strict";

  const ui = {
    current: document.getElementById("current-sentence"),
    replayCurrent: document.getElementById("replay-current"),
    history: document.getElementById("history"),
    count: document.getElementById("history-count"),
    exportSaved: document.getElementById("export-saved"),
    clearHistory: document.getElementById("clear-history"),
    template: document.getElementById("history-item-template"),
    filters: [...document.querySelectorAll(".filter")]
  };
  let entries = [];
  let filter = "all";

  function formatTime(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
  }

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function send(message) {
    const tab = await activeTab();
    if (!tab?.id) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      return null;
    }
  }

  async function replay(id = "") {
    await send({ type: "SIA_REPLAY_LAST", id });
  }

  async function updateEntry(id, changes) {
    const result = await send({ type: "SIA_UPDATE_HISTORY_ENTRY", id, ...changes });
    if (!result?.ok) return;
    const index = entries.findIndex(item => item.id === id);
    if (index >= 0) entries[index] = result.entry;
    render();
  }

  function render() {
    const visible = filter === "favorites"
      ? entries.filter(item => item.favorito)
      : entries;
    const current = entries.at(-1);
    ui.current.textContent = current?.texto || "Aguardando a primeira frase da aula…";
    ui.count.textContent = `${visible.length} ${visible.length === 1 ? "frase" : "frases"}`;
    ui.history.replaceChildren();

    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = filter === "favorites"
        ? "Seus trechos importantes aparecerão aqui."
        : "O histórico será construído enquanto a S·IA lê a aula.";
      ui.history.append(empty);
      return;
    }

    [...visible].reverse().forEach(entry => {
      const item = ui.template.content.firstElementChild.cloneNode(true);
      item.querySelector(".time").textContent = formatTime(entry.inicio);
      item.querySelector("p").textContent = entry.texto;
      item.querySelector(".note-text").textContent = entry.nota || "";
      const favorite = item.querySelector(".favorite");
      favorite.textContent = entry.favorito ? "★" : "☆";
      favorite.classList.toggle("active", entry.favorito);
      item.querySelector(".time").addEventListener("click", () => replay(entry.id));
      item.querySelector(".replay").addEventListener("click", () => replay(entry.id));
      favorite.addEventListener("click", () =>
        updateEntry(entry.id, { favorite: !entry.favorito })
      );
      item.querySelector(".note").addEventListener("click", () => {
        const note = prompt("Anotação sobre este trecho:", entry.nota || "");
        if (note !== null) void updateEntry(entry.id, { note });
      });
      ui.history.append(item);
    });
  }

  async function refresh() {
    const context = await send({ type: "SIA_GET_LEARNING_CONTEXT" });
    if (!context?.ok) {
      ui.current.textContent = "Abra uma aula do Coursera para usar o Companion.";
      return;
    }
    entries = Array.isArray(context.history) ? context.history : [];
    render();
  }

  ui.replayCurrent.addEventListener("click", () => replay());
  ui.exportSaved.addEventListener("click", () => {
    const saved = entries.filter(item => item.favorito);
    if (!saved.length) {
      alert("Salve pelo menos um trecho antes de exportar.");
      return;
    }
    const markdown = [
      "# Trechos salvos com a S·IA",
      "",
      ...saved.flatMap(item => [
        `## ${formatTime(item.inicio)} — ${item.titulo}`,
        "",
        item.texto,
        "",
        item.nota ? `> ${item.nota}` : "",
        "",
        `[Abrir aula](${item.url})`,
        ""
      ])
    ].join("\n");
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sia-trechos-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  });
  ui.clearHistory.addEventListener("click", async () => {
    if (!confirm("Remover o histórico desta aula? Os trechos salvos também serão apagados.")) {
      return;
    }
    const result = await send({ type: "SIA_CLEAR_HISTORY" });
    if (result?.ok) {
      entries = [];
      render();
    }
  });
  ui.filters.forEach(button => button.addEventListener("click", () => {
    filter = button.dataset.filter;
    ui.filters.forEach(item => item.classList.toggle("active", item === button));
    render();
  }));

  void refresh();
  setInterval(refresh, 1000);
})();
