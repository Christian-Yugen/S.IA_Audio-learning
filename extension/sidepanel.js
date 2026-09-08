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
    try {
      const tabs = await chrome?.tabs?.query?.({ active: true, lastFocusedWindow: true });
      if (tabs?.[0]) return tabs[0];
      const anyTabs = await chrome?.tabs?.query?.({ active: true });
      return anyTabs?.[0] || null;
    } catch {
      return null;
    }
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
      if (message?.type === "SIA_NEURO_STAGE_UPDATE" && message.stage) {
        if (isNeuroDirectorActive) {
          applyNeuroStageRecommendation(message.stage, false);
        }
      }
    });
  }

  // ==========================================================================
  // Controle do Palco Sonoro 3D Espacial · S·IA Neuro-Stage 3D
  // ==========================================================================
  const spatialUi = {
    radar: document.getElementById("spatial-radar"),
    puck: document.getElementById("spatial-puck"),
    puckVideo: document.getElementById("spatial-puck-video"),
    btnNeuroDirector: document.getElementById("btn-neuro-director"),
    neuroDirectorLabel: document.getElementById("neuro-director-label"),
    neuroInsightCard: document.getElementById("neuro-insight-card"),
    neuroStateBadge: document.getElementById("neuro-state-badge"),
    neuroInsightText: document.getElementById("neuro-insight-text"),
    posBadge: document.getElementById("spatial-pos-badge"),
    posText: document.getElementById("spatial-pos-text"),
    angleSlider: document.getElementById("spatial-angle-slider"),
    distSlider: document.getElementById("spatial-dist-slider"),
    angleValue: document.getElementById("spatial-angle-value"),
    distValue: document.getElementById("spatial-dist-value"),
    presetButtons: [...document.querySelectorAll(".preset-pill")],
    duckingButtons: [...document.querySelectorAll(".ducking-btn")],
    duckingModeStatus: document.getElementById("ducking-mode-status"),
    testBtn: document.getElementById("spatial-test-headphone"),
    testStatus: document.getElementById("spatial-test-status"),
    checkLeft: document.getElementById("check-ear-left"),
    checkRight: document.getElementById("check-ear-right"),
    calibBadge: document.getElementById("calib-quick-badge"),
    calibQuestionBox: document.getElementById("calib-question-box"),
    btnCalibYes: document.getElementById("btn-calib-yes"),
    btnCalibNo: document.getElementById("btn-calib-no"),
    calibSuccessBox: document.getElementById("calib-success-box"),
    btnRecalib: document.getElementById("btn-recalib"),
    monoDetectedCard: document.getElementById("mono-detected-card"),
    btnOpenWinSettings: document.getElementById("btn-open-win-settings"),
    btnRetryCalib: document.getElementById("btn-retry-calib"),
  };

  let currentAngle = 0;
  let currentDistance = 1.0;
  let currentVideoAngle = -25;
  let currentVideoDistance = 1.5;
  let currentDucking = 0;
  let isDraggingPuck = false;
  let isDraggingVideoPuck = false;
  let isNeuroDirectorActive = true;
  let activeNeuroPreset = "onu";

  function updateSpatialPosition(angle, distance, persist = true) {
    let deg = Math.round(Number(angle) || 0);
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    currentAngle = deg;
    currentDistance = Math.max(0.3, Math.min(2.5, Math.round((Number(distance) || 1.0) * 10) / 10));

    if (spatialUi.puck) {
      const rPct = Math.min(45, (currentDistance / 2.0) * 44);
      const rad = (currentAngle * Math.PI) / 180;
      const leftPct = 50 + rPct * Math.sin(rad);
      const topPct = 50 - rPct * Math.cos(rad);
      spatialUi.puck.style.left = `${leftPct}%`;
      spatialUi.puck.style.top = `${topPct}%`;
    }

    if (spatialUi.posText) {
      let dir;
      if (currentAngle === 0) dir = "Frente";
      else if (Math.abs(currentAngle) === 180) dir = "180° Atrás";
      else if (currentAngle > 0) dir = `+${currentAngle}° Direita`;
      else dir = `${currentAngle}° Esquerda`;
      spatialUi.posText.textContent = `${dir} · ${currentDistance.toFixed(1)}m`;
    }
    updateSpatialBadgeText();

    if (spatialUi.angleSlider) spatialUi.angleSlider.value = currentAngle;
    if (spatialUi.distSlider) spatialUi.distSlider.value = currentDistance;
    if (spatialUi.angleValue) {
      let dirName;
      if (Math.abs(currentAngle) <= 10) dirName = "Frente";
      else if (Math.abs(currentAngle) >= 170) dirName = "Atrás";
      else if (currentAngle > 0 && currentAngle < 90) dirName = "Frente-Dir";
      else if (currentAngle === 90) dirName = "Direita";
      else if (currentAngle > 90) dirName = "Trás-Dir";
      else if (currentAngle < 0 && currentAngle > -90) dirName = "Frente-Esq";
      else if (currentAngle === -90) dirName = "Esquerda";
      else dirName = "Trás-Esq";
      spatialUi.angleValue.textContent = `${currentAngle}° (${dirName})`;
    }
    if (spatialUi.distValue) spatialUi.distValue.textContent = `${currentDistance.toFixed(1)} m`;

    spatialUi.presetButtons.forEach(btn => {
      const bAngle = Number(btn.dataset.angle);
      const bDist = Number(btn.dataset.dist);
      const match = Math.abs(bAngle - currentAngle) <= 5 && Math.abs(bDist - currentDistance) <= 0.2;
      btn.classList.toggle("active", match);
    });

    if (persist) {
      try {
        chrome?.storage?.local?.set?.({
          sia_spatial_angle: currentAngle,
          sia_spatial_distance: currentDistance,
          sia_voice_engine: "piper-local",
        });
      } catch {}
      void send({ type: "SIA_CONFIG_UPDATE", key: "sia_spatial_angle", value: currentAngle });
      void send({ type: "SIA_CONFIG_UPDATE", key: "sia_spatial_distance", value: currentDistance });
      void send({ type: "SIA_CONFIG_UPDATE", key: "sia_voice_engine", value: "piper-local" });
    }
  }

  function updateVideoSpatialPosition(angle, distance, persist = true) {
    let deg = Math.round(Number(angle) || 0);
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    currentVideoAngle = deg;
    currentVideoDistance = Math.max(0.3, Math.min(2.5, Math.round((Number(distance) || 1.0) * 10) / 10));

    if (spatialUi.puckVideo) {
      const rPct = Math.min(45, (currentVideoDistance / 2.0) * 44);
      const rad = (currentVideoAngle * Math.PI) / 180;
      const leftPct = 50 + rPct * Math.sin(rad);
      const topPct = 50 - rPct * Math.cos(rad);
      spatialUi.puckVideo.style.left = `${leftPct}%`;
      spatialUi.puckVideo.style.top = `${topPct}%`;
    }

    updateSpatialBadgeText();

    if (persist) {
      try {
        chrome?.storage?.local?.set?.({
          sia_video_angle: currentVideoAngle,
          sia_video_distance: currentVideoDistance,
        });
      } catch {}
      void send({ type: "SIA_CONFIG_UPDATE", key: "sia_video_angle", value: currentVideoAngle });
      void send({ type: "SIA_CONFIG_UPDATE", key: "sia_video_distance", value: currentVideoDistance });
    }
  }

  function updateSpatialBadgeText() {
    if (spatialUi.posBadge) {
      const siaDir = currentAngle >= 0 ? `+${currentAngle}°` : `${currentAngle}°`;
      const vidDir = currentVideoAngle >= 0 ? `+${currentVideoAngle}°` : `${currentVideoAngle}°`;
      spatialUi.posBadge.title = `S·IA ${siaDir} · Vídeo ${vidDir}`;
    }
  }

  function setNeuroDirectorState(active, persist = true) {
    isNeuroDirectorActive = Boolean(active);
    if (spatialUi.btnNeuroDirector) {
      spatialUi.btnNeuroDirector.classList.toggle("active", isNeuroDirectorActive);
    }
    if (spatialUi.neuroDirectorLabel) {
      spatialUi.neuroDirectorLabel.textContent = isNeuroDirectorActive ? "Diretor IA Ativo" : "Modo Manual";
    }
    if (persist) {
      try {
        chrome?.storage?.local?.set?.({ sia_neuro_director_active: isNeuroDirectorActive });
      } catch {}
      void send({ type: "SIA_CONFIG_UPDATE", key: "sia_neuro_director_active", value: isNeuroDirectorActive });
    }
  }

  function applyNeuroStageRecommendation(stage, persist = true) {
    if (!stage) return;
    if (stage.sia) {
      updateSpatialPosition(stage.sia.angle, stage.sia.distance, persist);
    }
    if (stage.video) {
      updateVideoSpatialPosition(stage.video.angle, stage.video.distance, persist);
    }
    if (spatialUi.neuroStateBadge && stage.state) {
      const stateLabels = {
        vip_focus: "FOCO VIP ATIVO",
        ambient_relax: "PALCO AMBIENTE",
        balanced_cognitive: "SEPARAÇÃO ÁUREA",
      };
      spatialUi.neuroStateBadge.textContent = stateLabels[stage.state] || "SEPARAÇÃO ÁUREA";
    }
    if (spatialUi.neuroInsightText && stage.insight) {
      spatialUi.neuroInsightText.textContent = stage.insight;
    }
    if (stage.presetId) {
      activeNeuroPreset = stage.presetId;
      spatialUi.presetButtons.forEach(btn => {
        if (btn.dataset.preset) {
          btn.classList.toggle("active", btn.dataset.preset === activeNeuroPreset);
        }
      });
    }
  }

  function updateDuckingUI(level, persist = true) {
    let num = Number(level);
    if (!Number.isFinite(num) || num < 0) num = 0;
    if (num > 0 && num <= 1) {
      num = Math.round(num * 100);
    }
    currentDucking = Math.max(0, Math.min(100, Math.round(num)));

    spatialUi.duckingButtons.forEach(btn => {
      const val = Number(btn.dataset.ducking);
      let match = false;
      if (currentDucking === 0 && val === 0) match = true;
      else if (currentDucking > 0 && currentDucking <= 25 && val === 15) match = true;
      else if (currentDucking > 25 && val === 40) match = true;
      btn.classList.toggle("active", match);
    });

    if (spatialUi.duckingModeStatus) {
      if (currentDucking === 0) {
        spatialUi.duckingModeStatus.textContent = "Foco Total (vídeo mudo durante fala)";
      } else if (currentDucking <= 25) {
        spatialUi.duckingModeStatus.textContent = `Fundo Suave (${currentDucking}% vídeo durante fala)`;
      } else {
        spatialUi.duckingModeStatus.textContent = `Bilíngue (${currentDucking}% vídeo durante fala)`;
      }
    }

    if (persist) {
      try {
        chrome?.storage?.local?.set?.({ 
          sia_ducking: true, 
          sia_ducking_level: currentDucking 
        });
      } catch {}
      void send({ type: "SIA_CONFIG_UPDATE", key: "sia_ducking", value: true });
      void send({ type: "SIA_CONFIG_UPDATE", key: "sia_ducking_level", value: currentDucking });
    }
  }

  function setupSpatialControls() {
    if (!spatialUi.radar || !spatialUi.puck) return;

    function handlePointerCoord(clientX, clientY) {
      const rect = spatialUi.radar.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;

      const distPx = Math.sqrt(dx * dx + dy * dy);
      const maxR = rect.width * 0.44;
      const normDist = Math.max(0.15, Math.min(1.25, distPx / maxR));
      const dist = Math.round(normDist * 2.0 * 10) / 10;

      // Ângulo contínuo 360° no radar (0° frente, +90° dir, -90° esq, 180° atrás)
      const angleRad = Math.atan2(dx, -dy);
      let angleDeg = Math.round((angleRad * 180) / Math.PI);
      angleDeg = Math.max(-180, Math.min(180, angleDeg));

      updateSpatialPosition(angleDeg, dist, true);
    }

    spatialUi.puck.addEventListener("pointerdown", e => {
      isDraggingPuck = true;
      spatialUi.puck.classList.add("is-dragging");
      try { spatialUi.puck.setPointerCapture?.(e.pointerId); } catch {}
      e.preventDefault();
    });

    spatialUi.puck.addEventListener("pointermove", e => {
      if (!isDraggingPuck) return;
      handlePointerCoord(e.clientX, e.clientY);
    });

    const finishDrag = e => {
      if (!isDraggingPuck) return;
      isDraggingPuck = false;
      spatialUi.puck.classList.remove("is-dragging");
      try { spatialUi.puck.releasePointerCapture?.(e.pointerId); } catch {}
    };

    spatialUi.puck.addEventListener("pointerup", finishDrag);
    spatialUi.puck.addEventListener("pointercancel", finishDrag);

    function handleVideoPointerCoord(clientX, clientY) {
      const rect = spatialUi.radar.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;

      const distPx = Math.sqrt(dx * dx + dy * dy);
      const maxR = rect.width * 0.44;
      const normDist = Math.max(0.15, Math.min(1.25, distPx / maxR));
      const dist = Math.round(normDist * 2.0 * 10) / 10;

      const angleRad = Math.atan2(dx, -dy);
      let angleDeg = Math.round((angleRad * 180) / Math.PI);
      angleDeg = Math.max(-180, Math.min(180, angleDeg));

      updateVideoSpatialPosition(angleDeg, dist, true);
    }

    if (spatialUi.puckVideo) {
      spatialUi.puckVideo.addEventListener("pointerdown", e => {
        isDraggingVideoPuck = true;
        spatialUi.puckVideo.classList.add("is-dragging");
        try { spatialUi.puckVideo.setPointerCapture?.(e.pointerId); } catch {}
        e.preventDefault();
      });

      spatialUi.puckVideo.addEventListener("pointermove", e => {
        if (!isDraggingVideoPuck) return;
        handleVideoPointerCoord(e.clientX, e.clientY);
      });

      const finishVideoDrag = e => {
        if (!isDraggingVideoPuck) return;
        isDraggingVideoPuck = false;
        spatialUi.puckVideo.classList.remove("is-dragging");
        try { spatialUi.puckVideo.releasePointerCapture?.(e.pointerId); } catch {}
      };

      spatialUi.puckVideo.addEventListener("pointerup", finishVideoDrag);
      spatialUi.puckVideo.addEventListener("pointercancel", finishVideoDrag);
    }

    spatialUi.radar.addEventListener("click", e => {
      if (e.target === spatialUi.puck || spatialUi.puck.contains(e.target)) return;
      if (spatialUi.puckVideo && (e.target === spatialUi.puckVideo || spatialUi.puckVideo.contains(e.target))) return;
      handlePointerCoord(e.clientX, e.clientY);
    });

    if (spatialUi.btnNeuroDirector) {
      spatialUi.btnNeuroDirector.addEventListener("click", () => {
        setNeuroDirectorState(!isNeuroDirectorActive, true);
        if (isNeuroDirectorActive && globalThis.SiaNeuroDirector) {
          const stage = globalThis.SiaNeuroDirector.getRecommendedStage(ui.current?.textContent || "", {
            activePreset: activeNeuroPreset,
            isDirectorEnabled: true,
          });
          applyNeuroStageRecommendation(stage, true);
        }
      });
    }

    spatialUi.presetButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const presetKey = btn.dataset.preset;
        if (presetKey && globalThis.SiaNeuroDirector?.PRESETS?.[presetKey]) {
          const p = globalThis.SiaNeuroDirector.PRESETS[presetKey];
          activeNeuroPreset = presetKey;
          applyNeuroStageRecommendation({
            state: "balanced_cognitive",
            presetId: presetKey,
            sia: p.sia,
            video: p.video,
            insight: p.insight,
          }, true);
          if (presetKey === "vip") {
            updateDuckingUI(0, true);
          }
        } else {
          const angle = Number(btn.dataset.angle);
          const dist = Number(btn.dataset.dist);
          updateSpatialPosition(angle, dist, true);
        }
      });
    });

    if (spatialUi.angleSlider) {
      spatialUi.angleSlider.addEventListener("input", () => {
        updateSpatialPosition(Number(spatialUi.angleSlider.value), currentDistance, true);
      });
    }
    if (spatialUi.distSlider) {
      spatialUi.distSlider.addEventListener("input", () => {
        updateSpatialPosition(currentAngle, Number(spatialUi.distSlider.value), true);
      });
    }

    spatialUi.duckingButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        updateDuckingUI(Number(btn.dataset.ducking), true);
      });
    });

    if (spatialUi.testBtn) {
      spatialUi.testBtn.addEventListener("click", async () => {
        if (spatialUi.testBtn.classList.contains("is-testing")) return;
        spatialUi.testBtn.classList.add("is-testing");
        if (spatialUi.testStatus) spatialUi.testStatus.textContent = "Sintetizando e tocando no fone de ouvido...";

        try {
          await send({ type: "SIA_PRIME_NEURAL_AUDIO" }).catch(() => {});

          const res = await send({
            type: "SIA_TEST_SPATIAL_AUDIO",
            angle: currentAngle,
            distance: currentDistance,
          });

          if (spatialUi.testStatus) {
            if (res?.ok) {
              spatialUi.testStatus.textContent = "✓ Posição confirmada no fone de ouvido!";
            } else {
              spatialUi.testStatus.textContent = res?.message || "Abra uma aula com a S·IA ativa para testar.";
            }
          }
        } catch {
          if (spatialUi.testStatus) {
            spatialUi.testStatus.textContent = "Não foi possível reproduzir teste na página.";
          }
        } finally {
          spatialUi.testBtn.classList.remove("is-testing");
          setTimeout(() => {
            if (spatialUi.testStatus && spatialUi.testStatus.textContent.includes("✓")) {
              spatialUi.testStatus.textContent = "";
            }
          }, 4000);
        }
      });
    }

    function setCalibrationState(state) {
      if (state === true) {
        if (spatialUi.calibQuestionBox) spatialUi.calibQuestionBox.style.display = "none";
        if (spatialUi.monoDetectedCard) spatialUi.monoDetectedCard.style.display = "none";
        if (spatialUi.calibSuccessBox) spatialUi.calibSuccessBox.style.display = "flex";
        if (spatialUi.calibBadge) {
          spatialUi.calibBadge.textContent = "Calibrado ✓";
          spatialUi.calibBadge.classList.add("calibrated");
        }
      } else if (state === false) {
        if (spatialUi.calibQuestionBox) spatialUi.calibQuestionBox.style.display = "none";
        if (spatialUi.calibSuccessBox) spatialUi.calibSuccessBox.style.display = "none";
        if (spatialUi.monoDetectedCard) spatialUi.monoDetectedCard.style.display = "grid";
        if (spatialUi.calibBadge) {
          spatialUi.calibBadge.textContent = "Mono detectado ⚠️";
          spatialUi.calibBadge.classList.remove("calibrated");
        }
      } else {
        if (spatialUi.calibQuestionBox) spatialUi.calibQuestionBox.style.display = "grid";
        if (spatialUi.calibSuccessBox) spatialUi.calibSuccessBox.style.display = "none";
        if (spatialUi.monoDetectedCard) spatialUi.monoDetectedCard.style.display = "none";
        if (spatialUi.calibBadge) {
          spatialUi.calibBadge.textContent = "Clique para testar";
          spatialUi.calibBadge.classList.remove("calibrated");
        }
      }
    }

    function playChannelBeep(channelIndex) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const sampleRate = ctx.sampleRate;
        const duration = 0.55;
        const length = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, length, sampleRate);
        const targetChannel = buffer.getChannelData(channelIndex); // 0 = Esquerdo, 1 = Direito
        const baseFreq = channelIndex === 0 ? 523.25 : 659.25;

        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const envelope = Math.max(0, 1 - t / duration) * Math.min(1, t / 0.015);
          targetChannel[i] = envelope * 0.45 * (
            Math.sin(2 * Math.PI * baseFreq * t) +
            0.35 * Math.sin(4 * Math.PI * baseFreq * t)
          );
        }

        const btn = channelIndex === 0 ? spatialUi.checkLeft : spatialUi.checkRight;
        if (btn) btn.classList.add("playing");

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
        source.onended = () => {
          if (btn) btn.classList.remove("playing");
          try { ctx.close(); } catch {}
        };
      } catch (e) {
        console.warn("Falha ao tocar teste de canal", e);
      }
    }

    if (spatialUi.checkLeft) {
      spatialUi.checkLeft.addEventListener("click", () => {
        playChannelBeep(0);
        if (spatialUi.testStatus) {
          spatialUi.testStatus.textContent = "🔊 Emitindo som no canal ESQUERDO";
          setTimeout(() => { if (spatialUi.testStatus) spatialUi.testStatus.textContent = ""; }, 3000);
        }
      });
    }

    if (spatialUi.checkRight) {
      spatialUi.checkRight.addEventListener("click", () => {
        playChannelBeep(1);
        if (spatialUi.testStatus) {
          spatialUi.testStatus.textContent = "🔊 Emitindo som no canal DIREITO";
          setTimeout(() => { if (spatialUi.testStatus) spatialUi.testStatus.textContent = ""; }, 3000);
        }
      });
    }

    if (spatialUi.btnCalibYes) {
      spatialUi.btnCalibYes.addEventListener("click", () => {
        try {
          chrome?.storage?.local?.set?.({ sia_stereo_calibrated: true });
        } catch {}
        setCalibrationState(true);
        if (spatialUi.testStatus) {
          spatialUi.testStatus.textContent = "✓ Calibração confirmada! Som 3D ativo na aula.";
          setTimeout(() => { if (spatialUi.testStatus) spatialUi.testStatus.textContent = ""; }, 4000);
        }
      });
    }

    if (spatialUi.btnCalibNo) {
      spatialUi.btnCalibNo.addEventListener("click", () => {
        try {
          chrome?.storage?.local?.set?.({ sia_stereo_calibrated: false });
        } catch {}
        setCalibrationState(false);
        if (spatialUi.testStatus) {
          spatialUi.testStatus.textContent = "⚠️ Áudio Mono detectado no Windows.";
        }
      });
    }

    if (spatialUi.btnOpenWinSettings) {
      spatialUi.btnOpenWinSettings.addEventListener("click", () => {
        if (spatialUi.testStatus) {
          spatialUi.testStatus.textContent = "Abrindo configurações de áudio do Windows...";
          setTimeout(() => { if (spatialUi.testStatus) spatialUi.testStatus.textContent = ""; }, 3500);
        }

        try {
          const autoCloseHandler = (tab) => {
            chrome?.tabs?.onCreated?.removeListener?.(autoCloseHandler);
            setTimeout(() => {
              try {
                chrome?.tabs?.get?.(tab.id, (t) => {
                  if (t && (t.url === "about:blank" || t.url?.startsWith("ms-settings") || !t.url || t.title === "Sem título")) {
                    chrome?.tabs?.remove?.(tab.id);
                  }
                });
              } catch {}
            }, 4000);
          };
          chrome?.tabs?.onCreated?.addListener?.(autoCloseHandler);
        } catch {}
      });
    }

    if (spatialUi.btnRetryCalib) {
      spatialUi.btnRetryCalib.addEventListener("click", () => {
        setCalibrationState(null);
        if (spatialUi.testStatus) {
          spatialUi.testStatus.textContent = "🎧 Testando: tocando Esquerdo e depois Direito...";
        }
        playChannelBeep(0);
        setTimeout(() => {
          playChannelBeep(1);
        }, 650);
      });
    }

    if (spatialUi.btnRecalib) {
      spatialUi.btnRecalib.addEventListener("click", () => {
        try {
          chrome?.storage?.local?.set?.({ sia_stereo_calibrated: null });
        } catch {}
        setCalibrationState(null);
      });
    }

    try {
      chrome?.storage?.local?.get?.(
        ["sia_spatial_angle", "sia_spatial_distance", "sia_video_angle", "sia_video_distance", "sia_ducking_level", "sia_ducking", "sia_stereo_calibrated", "sia_neuro_director_active", "sia_neuro_preset"],
        res => {
          const directorActive = res?.sia_neuro_director_active !== undefined ? Boolean(res.sia_neuro_director_active) : true;
          setNeuroDirectorState(directorActive, false);

          if (res?.sia_neuro_preset) {
            activeNeuroPreset = res.sia_neuro_preset;
          }

          if (res?.sia_spatial_angle !== undefined || res?.sia_spatial_distance !== undefined) {
            const angle = res.sia_spatial_angle !== undefined ? Number(res.sia_spatial_angle) : 0;
            const dist = res.sia_spatial_distance !== undefined ? Number(res.sia_spatial_distance) : 1.0;
            updateSpatialPosition(angle, dist, false);
          } else {
            updateSpatialPosition(0, 1.0, false);
          }

          if (res?.sia_video_angle !== undefined || res?.sia_video_distance !== undefined) {
            const vAngle = res.sia_video_angle !== undefined ? Number(res.sia_video_angle) : -25;
            const vDist = res.sia_video_distance !== undefined ? Number(res.sia_video_distance) : 1.5;
            updateVideoSpatialPosition(vAngle, vDist, false);
          } else {
            updateVideoSpatialPosition(-25, 1.5, false);
          }

          if (globalThis.SiaNeuroDirector?.PRESETS?.[activeNeuroPreset] && spatialUi.neuroInsightText) {
            const p = globalThis.SiaNeuroDirector.PRESETS[activeNeuroPreset];
            spatialUi.neuroInsightText.textContent = p.insight;
          }

          if (res?.sia_ducking_level !== undefined) {
            updateDuckingUI(Number(res.sia_ducking_level), false);
          } else {
            updateDuckingUI(0, false);
          }

          if (res?.sia_stereo_calibrated === true) {
            setCalibrationState(true);
          } else if (res?.sia_stereo_calibrated === false) {
            setCalibrationState(false);
          } else {
            setCalibrationState(null);
          }
        }
      );
    } catch {
      updateSpatialPosition(0, 1.0, false);
      updateVideoSpatialPosition(-25, 1.5, false);
      updateDuckingUI(0, false);
      setCalibrationState(null);
    }
  }

  setupSpatialControls();

  void refresh();
  setInterval(refresh, 1000);
})();
