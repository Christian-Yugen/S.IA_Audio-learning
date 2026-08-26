(() => {
  "use strict";

  const ui = {
    current: document.getElementById("current-sentence"),
    replayCurrent: document.getElementById("replay-current"),
    history: document.getElementById("history"),
    count: document.getElementById("history-count"),
    exportSaved: document.getElementById("export-saved"),
    clearHistory: document.getElementById("clear-history"),
    clearStudy: document.getElementById("clear-study"),
    generateSummary: document.getElementById("generate-summary"),
    readSummary: document.getElementById("read-summary"),
    summaryCount: document.getElementById("summary-count"),
    summaryStatus: document.getElementById("summary-status"),
    summaryOutput: document.getElementById("summary-output"),
    lessonSummary: document.getElementById("lesson-summary"),
    template: document.getElementById("history-item-template"),
    filters: [...document.querySelectorAll(".filter")],
    studyProgress: document.getElementById("study-progress"),
    dueCount: document.getElementById("due-count"),
    bookmarkType: document.getElementById("bookmark-type"),
    bookmarkCurrent: document.getElementById("bookmark-current"),
    studyFeedback: document.getElementById("study-feedback"),
    recallQuestion: document.getElementById("recall-question"),
    recallAnswer: document.getElementById("recall-answer"),
    revealRecall: document.getElementById("reveal-recall"),
    recallSource: document.getElementById("recall-source"),
    reviewRatings: [...document.querySelectorAll("[data-rating]")],
  };
  let entries = [];
  let study = {
    enabled: false,
    currentCue: null,
    bookmarks: [],
    cards: [],
    dueCards: [],
    progress: null,
  };
  let filter = "all";
  let revealedCardId = "";
  let summary = null;

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

  async function replayStudyBookmark(id = "") {
    await send({ type: "SIA_REPLAY_STUDY_BOOKMARK", bookmarkId: id });
  }

  async function updateEntry(id, changes) {
    const result = await send({ type: "SIA_UPDATE_HISTORY_ENTRY", id, ...changes });
    if (!result?.ok) return;
    const index = entries.findIndex(item => item.id === id);
    if (index >= 0) entries[index] = result.entry;
    render();
  }

  function renderStudy() {
    const progress = study.progress || {};
    const due = Array.isArray(study.dueCards) ? study.dueCards : [];
    const card = due[0] || null;
    const start = Number(study.currentCue?.startTime);
    const end = Number(study.currentCue?.endTime);
    const hasCue = Boolean(
      study.currentCue?.text
      && Number.isFinite(start)
      && Number.isFinite(end)
      && end > start
    );

    ui.studyProgress.textContent = progress.total
      ? `${Number(progress.revisados || 0)} de ${Number(progress.total || 0)} revisados`
      : "Nenhum cartão ainda";
    ui.dueCount.textContent = due.length
      ? `${due.length} ${due.length === 1 ? "cartão agora" : "cartões agora"}`
      : "0 cartões agora";
    ui.bookmarkCurrent.disabled = !hasCue;
    ui.clearStudy.disabled = !study.enabled || (!study.bookmarks.length && !study.cards.length);
    if (!hasCue && !study.bookmarks.length) {
      ui.studyFeedback.textContent = "Aguarde uma frase da aula para começar.";
    } else if (!hasCue) {
      ui.studyFeedback.textContent = "A marcação aparece quando a S·IA estiver lendo uma frase segura.";
    }

    ui.recallQuestion.textContent = card?.pergunta
      || (study.cards.length
        ? "Você já respondeu tudo por enquanto. Os cartões voltarão no momento certo."
        : "Ainda não há nada para responder. Guarde um trecho acima e a pergunta aparecerá aqui.");
    ui.recallAnswer.disabled = !card;
    ui.revealRecall.disabled = !card;
    ui.reviewRatings.forEach(button => {
      button.disabled = !card;
    });

    const revealed = Boolean(card && revealedCardId === card.id);
    ui.recallSource.hidden = !revealed;
    ui.recallSource.textContent = revealed ? card.texto : "";
  }

  function renderSummary() {
    const data = summary?.resumo;
    const text = data?.texto || "";
    const selected = Number(data?.frasesSelecionadas || 0);
    const total = Number(data?.totalFrases || 0);
    const hasText = Boolean(text);
    ui.summaryOutput.hidden = !hasText;
    ui.lessonSummary.textContent = text;
    ui.generateSummary.disabled = !entries.length;
    ui.readSummary.disabled = !hasText;
    ui.summaryCount.textContent = hasText
      ? `${selected} de ${total} frases usadas`
      : "Ainda não gerado";
    if (!hasText) {
      ui.summaryStatus.textContent = entries.length
        ? "Clique em “Gerar resumo da aula” quando quiser revisar o que já foi lido."
        : "Aguarde a S·IA ler algumas frases antes de pedir o resumo.";
    } else if (data.limitado) {
      ui.summaryStatus.textContent = `Resumo curto feito com ${selected} frases de ${total}. Ele pode ficar parcial.`;
    } else {
      ui.summaryStatus.textContent = `Resumo feito com as ${selected} frases lidas nesta aula.`;
    }
  }

  function render() {
    const visible = filter === "favorites"
      ? entries.filter(item => item.favorito)
      : entries;
    const current = entries.at(-1);
    ui.current.textContent = current?.texto || "Aguardando a primeira frase da aula…";
    ui.count.textContent = `${visible.length} ${visible.length === 1 ? "frase" : "frases"}`;
    ui.history.replaceChildren();
    renderSummary();
    renderStudy();

    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = filter === "favorites"
        ? "Você ainda não salvou nenhum trecho. Use a estrela ao lado de uma frase para guardá-la aqui."
        : "As frases aparecerão aqui enquanto a S·IA lê. Depois, você poderá voltar, salvar ou adicionar uma nota.";
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
      study = {
        enabled: false,
        currentCue: null,
        bookmarks: [],
        cards: [],
        dueCards: [],
        progress: null,
      };
      revealedCardId = "";
      ui.current.textContent = "Abra uma aula compatível para acompanhar e revisar a leitura.";
      ui.bookmarkCurrent.disabled = true;
      ui.clearStudy.disabled = true;
      ui.generateSummary.disabled = true;
      ui.readSummary.disabled = true;
      ui.recallAnswer.disabled = true;
      ui.revealRecall.disabled = true;
      ui.reviewRatings.forEach(button => { button.disabled = true; });
      summary = null;
      renderSummary();
      ui.studyFeedback.textContent = "Abra uma aula compatível para guardar trechos de estudo.";
      ui.recallQuestion.textContent = "O estudo começa quando você abrir uma aula compatível.";
      return;
    }
    entries = Array.isArray(context.history) ? context.history : [];
    study = context.study || study;
    render();
  }

  async function markCurrent() {
    const result = await send({
      type: "SIA_CREATE_STUDY_BOOKMARK",
      bookmarkType: ui.bookmarkType.value,
    });
    if (!result?.ok) {
      ui.studyFeedback.textContent = result?.reason === "no-temporal-cue"
        ? "Ainda não há uma frase segura para guardar. Aguarde a próxima leitura."
        : "Não foi possível guardar este trecho agora. Tente novamente na próxima frase.";
      return;
    }
    const feedback = result.duplicate
      ? "Este trecho já está guardado. Ele voltará como pergunta na revisão."
      : "Trecho guardado. Ele virou uma pergunta para você revisar depois.";
    await refresh();
    ui.studyFeedback.textContent = feedback;
  }

  async function generateSummary() {
    ui.generateSummary.disabled = true;
    ui.summaryStatus.textContent = "Organizando as frases que a S·IA já leu…";
    const result = await send({ type: "SIA_GET_LESSON_SUMMARY" });
    ui.generateSummary.disabled = false;
    if (!result?.ok) {
      summary = null;
      renderSummary();
      ui.summaryStatus.textContent = "Não foi possível criar o resumo nesta aula.";
      return;
    }
    summary = result;
    renderSummary();
  }

  async function readSummary() {
    const text = summary?.resumo?.texto || "";
    if (!text) return;
    ui.readSummary.disabled = true;
    const result = await send({ type: "SIA_READ_LESSON_SUMMARY", text });
    ui.readSummary.disabled = false;
    ui.summaryStatus.textContent = result?.ok
      ? "O resumo foi enviado para a leitura. A aula foi pausada para você ouvir."
      : "Não foi possível iniciar a leitura do resumo.";
  }

  async function reviewCurrent(rating) {
    const card = study.dueCards?.[0];
    if (!card) return;
    const answer = ui.recallAnswer.value.trim();
    if (rating !== "forgot" && !answer) {
      ui.studyFeedback.textContent = "Antes de escolher, escreva o que você lembra. É assim que a revisão fortalece a memória.";
      ui.recallAnswer.focus();
      return;
    }
    const result = await send({
      type: "SIA_REVIEW_STUDY_CARD",
      cardId: card.id,
      rating,
      answer,
    });
    if (!result?.ok) {
      ui.studyFeedback.textContent = "Não foi possível registrar esta revisão.";
      return;
    }
    revealedCardId = "";
    ui.recallAnswer.value = "";
    const feedback = rating === "remembered"
      ? "Você marcou que lembrou. Este cartão voltará mais tarde para confirmar o aprendizado."
      : rating === "partial"
        ? "Você marcou que lembrou uma parte. Este cartão voltará em breve para reforçar o ponto."
        : "Você marcou que não lembrou. Tudo bem: este cartão voltará em breve para uma nova tentativa.";
    await refresh();
    ui.studyFeedback.textContent = feedback;
  }

  ui.replayCurrent.addEventListener("click", () => replay());
  ui.generateSummary.addEventListener("click", () => void generateSummary());
  ui.readSummary.addEventListener("click", () => void readSummary());
  ui.bookmarkCurrent.addEventListener("click", () => void markCurrent());
  ui.revealRecall.addEventListener("click", () => {
    const card = study.dueCards?.[0];
    if (!card) return;
    revealedCardId = revealedCardId === card.id ? "" : card.id;
    ui.recallSource.hidden = revealedCardId !== card.id;
    ui.recallSource.textContent = revealedCardId === card.id ? card.texto : "";
  });
  ui.reviewRatings.forEach(button => {
    button.addEventListener("click", () => void reviewCurrent(button.dataset.rating));
  });
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
  ui.clearStudy.addEventListener("click", async () => {
    if (!confirm("Apagar todas as marcações e cartões desta aula? O histórico de fala será preservado.")) {
      return;
    }
    const result = await send({ type: "SIA_CLEAR_STUDY" });
    if (result?.ok) {
      revealedCardId = "";
      ui.recallAnswer.value = "";
      await refresh();
      ui.studyFeedback.textContent = "Estudo local apagado para esta aula.";
    }
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
