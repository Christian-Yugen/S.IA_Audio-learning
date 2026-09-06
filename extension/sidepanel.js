(() => {
  "use strict";

  const ui = {
    current: document.getElementById("current-sentence"),
    replayCurrent: document.getElementById("replay-current"),
    history: document.getElementById("history"),
    count: document.getElementById("history-count"),
    exportSaved: document.getElementById("export-saved"),
    clearHistory: document.getElementById("clear-history"),
    toggleHistoryExpand: document.getElementById("toggle-history-expand"),
    generateTranscript: document.getElementById("generate-transcript"),
    replayTranscript: document.getElementById("replay-transcript"),
    downloadTranscript: document.getElementById("download-transcript"),
    transcriptCount: document.getElementById("transcript-count"),
    transcriptStatus: document.getElementById("transcript-status"),
    transcriptOutput: document.getElementById("transcript-output"),
    lessonTranscript: document.getElementById("lesson-transcript"),
    template: document.getElementById("history-item-template"),
    filters: [...document.querySelectorAll(".filter")],
    equalizerCanvas: document.getElementById("equalizer-canvas"),
    equalizerStage: document.getElementById("equalizer-stage"),
    waveformStatusBadge: document.getElementById("waveform-status-badge"),
    waveformStatusText: document.getElementById("waveform-status-text"),
  };
  const MAX_COLLAPSED_ITEMS = 4;
  let entries = [];
  let filter = "all";
  let isHistoryExpanded = false;
  let transcript = null;

  class StudioGraphicEqualizer {
    constructor(canvas, stage) {
      this.canvas = canvas;
      this.stage = stage;
      this.ctx = canvas?.getContext ? canvas.getContext("2d") : null;
      this.active = false;
      this.state = "idle";
      this.animId = null;

      this.numCols = 28;
      this.maxSegments = 12;

      this.levels = new Array(this.numCols).fill(1.0);
      this.targets = new Array(this.numCols).fill(1.0);
      this.velocities = new Array(this.numCols).fill(0);

      this.peaks = new Array(this.numCols).fill(0).map(() => ({ level: 1.0, hold: 0, vel: 0 }));

      // Frequências e fases fixas e descorrelacionadas para cada uma das 28 bandas (evita onda propagante lateral)
      this.bandPhases = [];
      this.bandFreqs = [];
      for (let i = 0; i < this.numCols; i++) {
        this.bandPhases.push(((i * 73 + 19) % 100) / 100 * Math.PI * 2);
        this.bandFreqs.push(0.009 + ((i * 37) % 11) * 0.0025);
      }

      this.segmentColors = [
        "#00e676", "#00e676", "#2ecc71", "#2ecc71",
        "#76ff03", "#aeea00", "#ffeb3b", "#ffc107",
        "#ff9800", "#ff5722", "#f44336", "#ff1744"
      ];

      this.text = "";
      this.words = [];
      this.wordPointer = 0;
      this.speechSpeed = 1.2;
      this.startTime = 0;
      this.currentEnergy = 0;

      this.resize();
    }

    resize() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : { width: 300, height: 56 };
      const width = Math.max(200, Math.floor(rect.width || 300));
      const height = 56;
      const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;

      this.displayWidth = width;
      this.displayHeight = height;

      if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
      }
      if (this.ctx?.scale && dpr !== 1) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
      }
    }

    start(text, speed = 1.2) {
      this.text = String(text || "").trim();
      this.speechSpeed = Math.max(0.6, Math.min(3.5, Number(speed) || 1.2));
      this.parsePhonetics(this.text);
      this.state = "speaking";
      this.active = true;
      this.startTime = Date.now();
      this.currentEnergy = 0.85;

      if (this.stage?.classList?.add) this.stage.classList.add("is-speaking");

      if (!this.animId && typeof requestAnimationFrame === "function") {
        this.loop = this.loop.bind(this);
        this.animId = requestAnimationFrame(this.loop);
      }
    }

    stop() {
      this.state = "idle";
      this.active = false;
      if (this.stage?.classList?.remove) this.stage.classList.remove("is-speaking");
    }

    setDisconnected() {
      this.state = "disconnected";
      this.active = false;
      if (this.stage?.classList?.remove) this.stage.classList.remove("is-speaking");
    }

    triggerBoundary(charIndex = 0) {
      this.currentEnergy = Math.min(1.0, this.currentEnergy + 0.65);
      if (this.words.length) {
        const found = this.words.findIndex(w => w.start >= charIndex || (w.start <= charIndex && w.end >= charIndex));
        if (found >= 0) this.wordPointer = found;
      }
    }

    parsePhonetics(text) {
      this.words = [];
      this.wordPointer = 0;
      if (!text) return;

      const regex = /(\S+)/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const raw = match[1];
        const clean = raw.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
        const hasComma = /[,;]/.test(raw);
        const hasPeriod = /[.!?]/.test(raw);

        const vowels = clean.match(/[aeiouáéíóúâêîôûãõàü]/gi) || [];
        const syllables = Math.max(1, vowels.length);
        const hasSibilant = /[szcxj]/i.test(clean);
        const hasPlosive = /[ptkbcçd]/i.test(clean);

        this.words.push({
          raw,
          clean,
          start: match.index,
          end: match.index + raw.length,
          syllables,
          hasComma,
          hasPeriod,
          hasSibilant,
          hasPlosive,
          durationMs: (syllables * 170 + (hasComma ? 250 : hasPeriod ? 400 : 70)) / this.speechSpeed
        });
      }
    }

    updatePhysics(now) {
      if (this.state === "disconnected") {
        for (let i = 0; i < this.numCols; i++) {
          this.targets[i] = 0.5;
        }
      } else if (this.state === "idle") {
        for (let i = 0; i < this.numCols; i++) {
          this.targets[i] = 1.0;
        }
      } else {
        const elapsed = now - this.startTime;
        let activeWord = null;
        let wordElapsed = 0;

        if (this.words.length > 0) {
          const totalDuration = this.words.reduce((sum, w) => sum + w.durationMs, 0);
          const cycleElapsed = totalDuration > 0 ? (elapsed % totalDuration) : 0;
          let accumulated = 0;
          for (let i = 0; i < this.words.length; i++) {
            const w = this.words[i];
            if (cycleElapsed >= accumulated && cycleElapsed < accumulated + w.durationMs) {
              activeWord = w;
              wordElapsed = cycleElapsed - accumulated;
              this.wordPointer = i;
              break;
            }
            accumulated += w.durationMs;
          }
        }

        let intensity = 0.78;
        let sylProgress = 0;
        let isSibilant = false;
        let isPlosive = false;

        if (activeWord) {
          const syllableDuration = Math.max(80, (activeWord.syllables * 170) / this.speechSpeed / activeWord.syllables);
          const currentSylIndex = Math.min(activeWord.syllables - 1, Math.floor(wordElapsed / syllableDuration));
          const sylElapsed = wordElapsed - (currentSylIndex * syllableDuration);
          sylProgress = Math.min(1, Math.max(0, sylElapsed / syllableDuration));

          let sylEnvelope;
          if (sylProgress < 0.22) {
            sylEnvelope = sylProgress / 0.22;
          } else if (sylProgress < 0.65) {
            sylEnvelope = 1.0 - (sylProgress - 0.22) * 0.35;
          } else {
            sylEnvelope = 0.85 - (sylProgress - 0.65) * 2.4;
          }
          sylEnvelope = Math.max(0.20, Math.min(1.0, sylEnvelope));

          const isTonic = activeWord.syllables === 1 || currentSylIndex === Math.max(0, activeWord.syllables - 2);
          intensity = (isTonic ? 1.0 : 0.82) * sylEnvelope;
          isSibilant = activeWord.hasSibilant;
          isPlosive = activeWord.hasPlosive;
        } else {
          // Pulso vocal dinâmico enquanto speaking estiver ativo
          const vocalPulse = Math.sin(now * 0.007) * 0.35 + 0.65;
          intensity = vocalPulse * 0.85;
        }

        this.currentEnergy = Math.max(this.currentEnergy * 0.94, intensity);

        for (let i = 0; i < this.numCols; i++) {
          const x = i / (this.numCols - 1);
          // Perfil de 4 faixas espectrais completas cobrindo todas as 28 colunas:
          // Colunas 0-5: Graves e frequência fundamental da voz
          // Colunas 6-15: Formantes vocálicos principais (F1/F2)
          // Colunas 16-22: Médios-altos e presença
          // Colunas 23-27: Agudos, harmônicos e ar da fala humana
          const bassFormant = 0.55 * Math.exp(-Math.pow((x - 0.12) / 0.12, 2));
          const voiceFormant = Math.exp(-Math.pow((x - 0.38) / 0.18, 2));
          const presenceFormant = 0.80 * Math.exp(-Math.pow((x - 0.65) / 0.16, 2));
          const trebleFormant = 0.65 * Math.exp(-Math.pow((x - 0.88) / 0.16, 2));
          const spectralWeight = bassFormant + voiceFormant + presenceFormant + trebleFormant;

          // Oscilação puramente vertical ancorada na sua coluna (sem onda propagante lateral)
          const bandOsc = Math.sin(now * this.bandFreqs[i] + this.bandPhases[i]);
          const verticalVibration = 1.0 + bandOsc * 0.32;

          // Resposta fonética ancorada na sua respectiva faixa de frequência
          const sibilantBoost = (i >= 18 && isSibilant)
            ? 3.8 * intensity * (0.8 + 0.3 * Math.sin(now * 0.025 + this.bandPhases[i]))
            : 0;
          const plosiveBoost = (i >= 2 && i <= 14 && isPlosive && sylProgress < 0.25)
            ? 3.2 * intensity
            : 0;

          const target = 1.0 + (spectralWeight * 8.5 * intensity * verticalVibration) + sibilantBoost + plosiveBoost;
          this.targets[i] = Math.max(1.0, Math.min(this.maxSegments, target));
        }
      }

      const springTension = 0.52;
      const damping = 0.65;

      for (let i = 0; i < this.numCols; i++) {
        const diff = this.targets[i] - this.levels[i];
        this.velocities[i] = (this.velocities[i] + diff * springTension) * damping;
        this.levels[i] = Math.max(0.5, Math.min(this.maxSegments, this.levels[i] + this.velocities[i]));

        const pk = this.peaks[i];
        if (this.levels[i] >= pk.level) {
          pk.level = this.levels[i];
          pk.hold = 10;
          pk.vel = 0;
        } else if (pk.hold > 0) {
          pk.hold--;
        } else {
          pk.vel += 0.25;
          pk.level = Math.max(this.levels[i], pk.level - pk.vel);
        }
      }
    }

    loop(now) {
      if (!this.active && this.state !== "speaking") {
        let settled = true;
        for (let i = 0; i < this.numCols; i++) {
          if (Math.abs(this.levels[i] - this.targets[i]) > 0.08 || Math.abs(this.velocities[i]) > 0.08) {
            settled = false;
            break;
          }
        }
        if (settled) {
          for (let i = 0; i < this.numCols; i++) {
            this.levels[i] = this.targets[i];
            this.peaks[i].level = this.targets[i];
          }
          if (this.animId) {
            cancelAnimationFrame(this.animId);
            this.animId = null;
          }
          this.draw();
          return;
        }
      }

      this.updatePhysics(now || Date.now());
      this.draw();

      if (typeof requestAnimationFrame === "function") {
        this.animId = requestAnimationFrame(this.loop);
      }
    }

    draw() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const width = this.displayWidth || 300;
      const height = this.displayHeight || 56;

      ctx.clearRect(0, 0, width, height);

      const baselineY = height - 4;
      const maxBarHeight = baselineY - 4;
      const gap = 2;
      const colWidth = Math.max(2, (width - (this.numCols - 1) * gap) / this.numCols);
      const segGap = 1.5;
      const segHeight = Math.max(2, (maxBarHeight - (this.maxSegments - 1) * segGap) / this.maxSegments);

      ctx.fillStyle = "rgba(46, 204, 113, 0.2)";
      ctx.fillRect(0, baselineY + 1, width, 1);

      for (let col = 0; col < this.numCols; col++) {
        const x = col * (colWidth + gap);
        const activeSegs = Math.max(1, Math.round(this.levels[col]));
        const peakSeg = Math.min(this.maxSegments - 1, Math.round(this.peaks[col].level));

        for (let s = 0; s < activeSegs && s < this.maxSegments; s++) {
          const y = baselineY - (s + 1) * (segHeight + segGap);
          ctx.fillStyle = this.state === "disconnected" ? "#555555" : this.segmentColors[s];
          this.drawRoundedRect(ctx, x, y, colWidth, segHeight, 1);
        }

        if (this.state !== "disconnected" && peakSeg > 1 && peakSeg > activeSegs) {
          const peakY = baselineY - (peakSeg + 1) * (segHeight + segGap);
          ctx.fillStyle = "#ff1744";
          this.drawRoundedRect(ctx, x, peakY, colWidth, segHeight, 1);
        }
      }
    }

    drawRoundedRect(ctx, x, y, w, h, r) {
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  const equalizer = new StudioGraphicEqualizer(ui.equalizerCanvas, ui.equalizerStage);
  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => equalizer.resize());
  }

  function setWaveformState(state, label = null, text = null) {
    if (ui.waveformStatusBadge) {
      ui.waveformStatusBadge.dataset.state = state;
    }
    const defaultLabels = {
      idle: "Pronta",
      speaking: "Lendo agora",
      disconnected: "Desconectada"
    };
    const statusText = label || defaultLabels[state] || defaultLabels.idle;
    if (ui.waveformStatusText) {
      ui.waveformStatusText.textContent = statusText;
    }
    const ariaLabels = {
      idle: "Status da voz S·IA: em espera",
      speaking: "Status da voz S·IA: lendo frase da aula",
      disconnected: "Status da voz S·IA: aula não conectada"
    };
    if (typeof ui.waveformStatusBadge?.setAttribute === "function") {
      ui.waveformStatusBadge.setAttribute("aria-label", ariaLabels[state] || ariaLabels.idle);
    }
    if (ui.waveformStatusBadge) {
      ui.waveformStatusBadge.title = statusText;
    }

    if (state === "speaking") {
      equalizer.start(text || ui.current?.textContent);
    } else if (state === "disconnected") {
      equalizer.setDisconnected();
    } else {
      equalizer.stop();
    }
  }

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

  function transcriptHasSafeTiming() {
    return (transcript?.transcricao?.trechos || []).some(item => {
      const inicio = Number(item?.inicio);
      const fim = Number(item?.fim);
      return Number.isFinite(inicio) && Number.isFinite(fim) && fim > inicio;
    });
  }

  function renderTranscript() {
    const data = transcript?.transcricao;
    const text = data?.texto || "";
    const total = Number(data?.totalFrases || 0);
    const hasText = Boolean(text);
    const hasReplayTiming = transcriptHasSafeTiming();
    ui.transcriptOutput.hidden = !hasText;
    ui.lessonTranscript.textContent = text;
    ui.generateTranscript.disabled = !entries.length;
    ui.replayTranscript.disabled = !hasReplayTiming;
    ui.downloadTranscript.disabled = !hasText;
    ui.transcriptCount.textContent = hasText
      ? `${total} ${total === 1 ? "frase lida" : "frases lidas"}${transcript.parcial ? " · registro limitado" : ""}`
      : "Ainda não exibida";
    if (!hasText) {
      ui.transcriptStatus.textContent = entries.length
        ? "Clique em “Mostrar legenda lida” para ver o texto que a S·IA já leu."
        : "Aguarde a S·IA ler algumas frases antes de mostrar a legenda.";
    } else if (transcript.parcial) {
      ui.transcriptStatus.textContent = `Registro local com ${total} ${total === 1 ? "frase lida" : "frases lidas"}; o limite de segurança foi atingido.`;
    } else if (!hasReplayTiming) {
      ui.transcriptStatus.textContent = `${total} ${total === 1 ? "frase lida" : "frases lidas"} exibidas, mas sem intervalo temporal seguro para rever no vídeo.`;
    } else {
      ui.transcriptStatus.textContent = `${total} ${total === 1 ? "frase lida" : "frases lidas"} exibidas. Você pode rever no vídeo o intervalo registrado.`;
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
    renderTranscript();

    if (!visible.length) {
      if (ui.toggleHistoryExpand) {
        ui.toggleHistoryExpand.hidden = true;
      }
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = filter === "favorites"
        ? "Você ainda não salvou nenhum trecho. Use a estrela ao lado de uma frase para guardá-la aqui."
        : "As frases aparecerão aqui enquanto a S·IA lê. Depois, você poderá voltar, salvar ou adicionar uma nota.";
      ui.history.append(empty);
      return;
    }

    const reversed = [...visible].reverse();
    const hasMore = reversed.length > MAX_COLLAPSED_ITEMS;
    const itemsToRender = (!isHistoryExpanded && hasMore)
      ? reversed.slice(0, MAX_COLLAPSED_ITEMS)
      : reversed;

    if (ui.toggleHistoryExpand) {
      if (hasMore) {
        ui.toggleHistoryExpand.hidden = false;
        ui.toggleHistoryExpand.setAttribute("aria-expanded", isHistoryExpanded ? "true" : "false");
        const remaining = reversed.length - MAX_COLLAPSED_ITEMS;
        ui.toggleHistoryExpand.textContent = isHistoryExpanded
          ? "↑ Recolher para 4 mais recentes"
          : `↓ Ver frases anteriores (+${remaining})`;
      } else {
        ui.toggleHistoryExpand.hidden = true;
      }
    }

    itemsToRender.forEach(entry => {
      const item = ui.template.content.firstElementChild.cloneNode(true);
      item.querySelector(".time").textContent = formatTime(entry.inicio);
      item.querySelector("p").textContent = entry.texto;
      if (entry.traduzido && entry.textoOriginal) {
        const original = document.createElement("small");
        original.className = "original-text";
        original.textContent = entry.textoOriginal;
        item.querySelector("p").after(original);
      }
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
      setWaveformState("disconnected");
      ui.current.textContent = "Abra uma aula compatível para acompanhar a leitura.";
      ui.generateTranscript.disabled = true;
      ui.replayTranscript.disabled = true;
      ui.downloadTranscript.disabled = true;
      transcript = null;
      renderTranscript();
      return;
    }
    entries = Array.isArray(context.history) ? context.history : [];
    if (context.isSpeaking) {
      setWaveformState("speaking", null, context.currentSpeechText || ui.current?.textContent);
    } else {
      setWaveformState("idle");
    }
    render();
  }

  async function generateTranscript() {
    ui.generateTranscript.disabled = true;
    ui.transcriptStatus.textContent = "Mostrando as legendas que a S·IA já leu…";
    const result = await send({ type: "SIA_GET_LESSON_TRANSCRIPT" });
    ui.generateTranscript.disabled = false;
    if (!result?.ok) {
      transcript = null;
      renderTranscript();
      ui.transcriptStatus.textContent = "Não foi possível mostrar a legenda lida desta aula.";
      return;
    }
    transcript = result;
    renderTranscript();
  }

  async function replayTranscript() {
    if (!transcriptHasSafeTiming()) return;
    ui.replayTranscript.disabled = true;
    const result = await send({ type: "SIA_REPLAY_LESSON_TRANSCRIPT" });
    ui.replayTranscript.disabled = false;
    ui.transcriptStatus.textContent = result?.ok
      ? "O vídeo voltou ao primeiro trecho registrado. A S·IA acompanhará as legendas e pausará ao fim do intervalo capturado."
      : result?.reason === "transcript-timing-unavailable"
        ? "Não há um intervalo temporal seguro para rever este registro."
        : "Não foi possível iniciar a revisão no vídeo desta aula.";
  }

  function downloadTranscriptFile() {
    const data = transcript?.transcricao;
    if (!data?.texto) return;
    const titulo = String(transcript.titulo || "Aula").trim();
    const conteudo = [
      `AULA: ${titulo || "Aula"}`,
      `URL: ${transcript.url || ""}`,
      `FRASES DA LEGENDA LIDA: ${Number(data.totalFrases || 0)}`,
      "",
      data.texto,
      "",
    ].join("\\n");
    const nomeBase = (titulo || "aula")
      .normalize("NFD")
      .toLocaleLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "aula";
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sia-${nomeBase}-legenda-lida.txt`;
    link.click();
    URL.revokeObjectURL(url);
    ui.transcriptStatus.textContent = "Legenda lida salva no dispositivo.";
  }

  ui.replayCurrent.addEventListener("click", () => replay());
  ui.generateTranscript.addEventListener("click", () => void generateTranscript());
  ui.replayTranscript.addEventListener("click", () => void replayTranscript());
  ui.downloadTranscript.addEventListener("click", downloadTranscriptFile);
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
      transcript = null;
      isHistoryExpanded = false;
      render();
    }
  });
  if (ui.toggleHistoryExpand) {
    ui.toggleHistoryExpand.addEventListener("click", () => {
      isHistoryExpanded = !isHistoryExpanded;
      render();
    });
  }
  ui.filters.forEach(button => button.addEventListener("click", () => {
    filter = button.dataset.filter;
    ui.filters.forEach(item => item.classList.toggle("active", item === button));
    render();
  }));

  if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener(message => {
      if (message?.type === "SIA_SPEECH_STATE") {
        const isSpeaking = Boolean(message.isSpeaking);
        if (message.text && ui.current && isSpeaking) {
          ui.current.textContent = message.text;
        }
        setWaveformState(isSpeaking ? "speaking" : "idle", null, message.text || ui.current?.textContent);
      }
      if (message?.type === "SIA_SPEECH_CADENCE") {
        equalizer.triggerBoundary(message.charIndex);
      }
    });
  }

  void refresh();
  setInterval(refresh, 1000);
})();
