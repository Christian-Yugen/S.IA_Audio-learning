(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    sia_enabled: true,
    sia_voice: "",
    sia_lang: "pt-BR",
    sia_speed: 1.2,
    sia_pitch: 1,
    sia_volume: 100,
    sia_sync: "accelerate_voice",
    sia_voice_engine: "browser",
    sia_translate_en_pt: false,
    sia_compact: false
  });

  document.addEventListener("DOMContentLoaded", async () => {
    const ui = {
      container: document.querySelector(".container"),
      power: document.getElementById("toggle-power"),
      powerText: document.querySelector(".power-text"),
      compactToggle: document.getElementById("toggle-compact"),
      summaryVoice: document.getElementById("summary-voice"),
      summarySpeed: document.getElementById("summary-speed"),
      summaryAudio: document.getElementById("summary-audio"),
      summarySync: document.getElementById("summary-sync"),
      engine: document.getElementById("select-engine"),
      voice: document.getElementById("select-voice"),
      lang: document.getElementById("select-lang"),
      translateEnglish: document.getElementById("translate-english"),
      speed: document.getElementById("input-speed"),
      speedLabel: document.getElementById("label-speed"),
      pitch: document.getElementById("input-pitch"),
      pitchLabel: document.getElementById("label-pitch"),
      volume: document.getElementById("input-volume"),
      volumeLabel: document.getElementById("label-volume"),
      sync: [...document.querySelectorAll('input[name="sync-behavior"]')],
      replayLast: document.getElementById("replay-last"),
      openCompanion: document.getElementById("open-companion"),
      testVoice: document.getElementById("test-voice"),
      reset: document.getElementById("reset-settings"),
      status: document.getElementById("connection-status"),
      saveFeedback: document.getElementById("save-feedback"),
      version: document.getElementById("version-label"),
      platform: document.getElementById("select-platform"),
      platformScope: document.getElementById("platform-scope"),
      applyPlatform: document.getElementById("apply-platform"),
      platformDiagnostic: document.getElementById("platform-diagnostic")
    };

    const manifest = chrome.runtime.getManifest?.() || {};
    if (ui.version) {
      ui.version.textContent = `v${manifest.version || "?"} · ${manifest.version_name || "S·IA"}`;
    }

    const saved = await chrome.storage.local.get([
      ...Object.keys(DEFAULTS),
      "sia_course_profiles",
      "sia_platform_selections"
    ]);
    const tabAtivo = await activeTab();
    const courseId = tabAtivo?.url?.match(/\/learn\/([^/]+)/)?.[1] || "";
    const courseProfile = courseId ? saved.sia_course_profiles?.[courseId] : null;
    const settings = { ...DEFAULTS, ...saved, ...(courseProfile || {}) };
    let feedbackTimer = 0;
    let platformSelectionDirty = false;
    let platformContext = {
      tab: tabAtivo,
      url: tabAtivo?.url || "",
      hostKey: "",
      detected: "",
      requested: "off",
      source: "default",
      compatible: false
    };

    function setStatus(text, state = "unavailable") {
      ui.status.className = `connection-status ${state}`;
      ui.status.querySelector("span").textContent = text;
    }

    function renderPower() {
      const enabled = Boolean(settings.sia_enabled);
      ui.power.classList.toggle("active", enabled);
      ui.power.setAttribute("aria-checked", String(enabled));
      ui.powerText.textContent = enabled ? "ON" : "OFF";
      ui.container.classList.toggle("is-disabled", !enabled);
      ui.testVoice.disabled = !enabled;
      ui.replayLast.disabled = !enabled;
    }

    async function readPlatformContext() {
      const tab = await activeTab();
      const url = String(tab?.url || "");
      const selectionApi = globalThis.SiaPlatformSelection;
      if (!selectionApi || !tab?.id || !url) {
        return { ...platformContext, tab, url };
      }
      try {
        const remote = await chrome.runtime.sendMessage({
          target: "sia-platform-selection-get",
          tabId: tab.id,
          url
        });
        if (remote?.ok) {
          const description = selectionApi.describeSelection(url, remote.requested);
          return { ...remote, tab, url, detected: description.detected, ...description };
        }
      } catch {
        // O popup continua funcional mesmo enquanto o service worker é acordado.
      }
      const hostKey = selectionApi.hostKeyFromUrl(url);
      const fallbackMode = saved.sia_platform_selections?.[hostKey]
        || selectionApi.defaultModeForUrl(url);
      const description = selectionApi.describeSelection(url, fallbackMode);
      return { tab, url, hostKey, source: "default", ...description };
    }

    function renderPlatform() {
      if (!ui.platform || !globalThis.SiaPlatformSelection) return;
      const detected = platformContext.detected;
      [...ui.platform.options].forEach(option => {
        const value = option.value;
        const allowed = value === "auto"
          ? Boolean(detected)
          : value === detected
            || (detected === "youtube" && value === "off")
            || (!detected && value === "off");
        option.disabled = !allowed;
      });
      const requested = globalThis.SiaPlatformSelection.normalizePlatform(platformContext.requested);
      ui.platform.value = [...ui.platform.options].some(option => option.value === requested && !option.disabled)
        ? requested
        : (detected === "youtube" ? "off" : detected || "off");
      ui.platformScope.disabled = detected !== "youtube";
      ui.platformScope.checked = platformContext.source === "domain" && detected === "youtube";
      ui.applyPlatform.disabled = !detected || (ui.platform.value !== "off" && !globalThis.SiaPlatformSelection.isCompatible(platformContext.url, ui.platform.value));
      const selected = ui.platform.value;
      if (!detected) {
        ui.platformDiagnostic.textContent = "Esta página ainda não possui adaptador S·IA.";
        ui.platformDiagnostic.className = "platform-diagnostic is-warning";
      } else if (detected === "youtube" && selected === "off") {
        ui.platformDiagnostic.textContent = "YouTube detectado. Selecione YouTube e aplique para ativar o adaptador nesta aba.";
        ui.platformDiagnostic.className = "platform-diagnostic is-warning";
      } else if (detected === "youtube") {
        const scope = platformContext.source === "domain" ? "fixado neste site" : "válido nesta aba";
        ui.platformDiagnostic.textContent = `YouTube selecionado · ${scope}. O núcleo de áudio continuará compartilhado.`;
        ui.platformDiagnostic.className = "platform-diagnostic is-ready";
      } else {
        ui.platformDiagnostic.textContent = `${globalThis.SiaPlatformSelection.PLATFORM_LABELS[detected]} permanece no modo legado automático protegido.`;
        ui.platformDiagnostic.className = "platform-diagnostic";
      }
    }

    async function applyPlatformSelection() {
      const tab = await activeTab();
      const selected = ui.platform?.value || "off";
      const detected = platformContext.detected;
      if (!tab?.id || !detected) {
        showSavedFeedback("Nenhum adaptador disponível nesta página");
        return;
      }
      if (detected !== "youtube") {
        if (selected === detected || selected === "auto") {
          showSavedFeedback(`${globalThis.SiaPlatformSelection.PLATFORM_LABELS[detected]} permanece protegido`);
        } else {
          showSavedFeedback("Escolha incompatível; nada foi alterado");
        }
        renderPlatform();
        return;
      }
      const result = await chrome.runtime.sendMessage({
        target: "sia-platform-selection-apply",
        tabId: tab.id,
        url: tab.url,
        mode: selected,
        scope: ui.platformScope.checked ? "domain" : "tab"
      }).catch(error => ({ ok: false, message: error?.message || String(error) }));
      if (!result?.ok) {
        ui.platformDiagnostic.textContent = result?.diagnostic?.message || result?.message || "Não foi possível aplicar a plataforma.";
        ui.platformDiagnostic.className = "platform-diagnostic is-warning";
        return;
      }
      platformSelectionDirty = false;
      platformContext = {
        ...platformContext,
        requested: selected,
        source: ui.platformScope.checked ? "domain" : "tab"
      };
      showSavedFeedback(selected === "off" ? "YouTube desativado nesta aba" : "YouTube ativado nesta aba");
      if (selected === "off" || result.active || result.alreadyActive) {
        await chrome.tabs.reload(tab.id);
        window.close();
      }
    }

    function updateRangeFill(input) {
      const min = Number(input.min);
      const max = Number(input.max);
      const progress = ((Number(input.value) - min) / (max - min)) * 100;
      input.style.setProperty("--range-progress", `${progress}%`);
    }

    function renderSummary() {
      const selectedVoice = ui.voice.selectedOptions[0]?.textContent || "Automática";
      ui.summaryVoice.textContent = settings.sia_voice_engine === "piper-local"
        ? "Neural local PT-BR"
        : selectedVoice.replace(/\s+—\s+.+$/, "");
      ui.summarySpeed.textContent = `${Number(settings.sia_speed).toFixed(1)}x`;
      ui.summaryAudio.textContent =
        `Pitch ${Number(settings.sia_pitch).toFixed(1)} · ${Number(settings.sia_volume)}%`;
      ui.summarySync.textContent =
        settings.sia_sync === "slow_video" ? "Desacelerar vídeo" : "Ajustar voz";
      if (ui.engine) {
        ui.engine.value = settings.sia_voice_engine;
      }
    }

    function renderCompactMode() {
      const compact = Boolean(settings.sia_compact);
      ui.container.classList.toggle("is-compact", compact);
      ui.compactToggle.setAttribute("aria-pressed", String(compact));
      ui.compactToggle.setAttribute(
        "aria-label",
        compact ? "Exibir todos os ajustes" : "Ativar modo compacto"
      );
      ui.compactToggle.title = compact ? "Expandir ajustes" : "Modo compacto";
    }

    function render() {
      ui.lang.value = settings.sia_lang;
      if (ui.translateEnglish) ui.translateEnglish.checked = Boolean(settings.sia_translate_en_pt);
      if (ui.engine) ui.engine.value = settings.sia_voice_engine;
      ui.voice.disabled = settings.sia_voice_engine === "piper-local";
      ui.speed.value = settings.sia_speed;
      ui.speedLabel.value = `${Number(settings.sia_speed).toFixed(1)}x`;
      ui.pitch.value = settings.sia_pitch;
      ui.pitchLabel.value = Number(settings.sia_pitch).toFixed(1);
      ui.volume.value = settings.sia_volume;
      ui.volumeLabel.value = `${Number(settings.sia_volume)}%`;
      ui.sync.forEach(radio => radio.checked = radio.value === settings.sia_sync);
      [ui.speed, ui.pitch, ui.volume].forEach(updateRangeFill);
      renderPower();
      renderCompactMode();
      renderSummary();
      renderPlatform();
    }

    function matchingVoices() {
      const language = settings.sia_lang.toLowerCase();
      const baseLanguage = language.split("-")[0];
      const allVoices = speechSynthesis.getVoices().slice();
      const exact = allVoices.filter(voice => voice.lang.toLowerCase() === language);
      const sameLanguage = allVoices.filter(
        voice => voice.lang.toLowerCase().split("-")[0] === baseLanguage
      );
      return (exact.length ? exact : sameLanguage).sort(
        (a, b) => a.name.localeCompare(b.name)
      );
    }

    function loadVoices() {
      const voices = matchingVoices();
      ui.voice.replaceChildren(new Option("Automática (recomendada)", ""));

      voices.forEach(voice => {
        const option = new Option(`${voice.name} — ${voice.lang}`, voice.voiceURI);
        option.dataset.name = voice.name;
        ui.voice.append(option);
      });

      if (!voices.length) {
        ui.voice.append(new Option(`Nenhuma voz para ${settings.sia_lang}`, "__none__"));
        ui.voice.options[1].disabled = true;
      }

      const match = [...ui.voice.options].find(
        option => option.value === settings.sia_voice || option.dataset.name === settings.sia_voice
      );
      ui.voice.value = match?.value || "";
      renderSummary();
    }

    function showSavedFeedback(message = "Configurações salvas") {
      clearTimeout(feedbackTimer);
      ui.saveFeedback.textContent = `✓ ${message}`;
      ui.saveFeedback.classList.add("visible");
      feedbackTimer = setTimeout(() => ui.saveFeedback.classList.remove("visible"), 1400);
    }

    async function activeTab() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    }

    async function sendToContent(message) {
      const tab = await activeTab();
      if (!tab?.id) {
        return {
          ok: false,
          reason: "no-active-tab",
          message: "nenhuma aba ativa disponível"
        };
      }
      try {
        const response = await chrome.tabs.sendMessage(tab.id, message);
        return response || {
          ok: false,
          reason: "content-no-response",
          message: "a aba não respondeu"
        };
      } catch (error) {
        const detail = String(error?.message || error || "");
        const staleContext = /context invalidated|receiving end does not exist|could not establish connection|message port closed/i.test(detail);
        return {
          ok: false,
          reason: staleContext ? "content-context-invalidated" : "content-message-failed",
          message: staleContext
            ? "reabra a aba da aula para aplicar a versão atual da extensão"
            : "não foi possível comunicar com a aba da aula"
        };
      }
    }

    async function saveAndSend(key, value, showFeedback = true) {
      settings[key] = value;
      await chrome.storage.local.set({ [key]: value });
      if (
        courseId
        && ["sia_voice", "sia_lang", "sia_speed", "sia_pitch", "sia_volume", "sia_sync", "sia_voice_engine"]
          .includes(key)
      ) {
        const result = await chrome.storage.local.get("sia_course_profiles");
        const profiles = result.sia_course_profiles || {};
        profiles[courseId] = { ...(profiles[courseId] || {}), [key]: value };
        await chrome.storage.local.set({ sia_course_profiles: profiles });
      }
      const delivery = await sendToContent({ type: "SIA_CONFIG_UPDATE", key, value });
      if (showFeedback) {
        const contextInvalidated = delivery?.reason === "content-context-invalidated";
        const engineApplied = key === "sia_voice_engine"
          && delivery?.voiceEngine === value;
        showSavedFeedback(
          contextInvalidated
            ? "Salvo · reabra a aba da aula"
            : engineApplied
              ? `Motor aplicado: ${value === "piper-local" ? "neural local" : "navegador"}`
              : "Configurações salvas"
        );
      }

    }

    async function updateConnectionStatus() {
      const tab = await activeTab();
      const nextPlatformContext = await readPlatformContext();
      if (nextPlatformContext.url !== platformContext.url) {
        platformSelectionDirty = false;
      }
      if (!platformSelectionDirty) {
        platformContext = nextPlatformContext;
        renderPlatform();
      }
      const isCourseraLecture = Boolean(tab?.url?.match(/^https:\/\/([^.]+\.)?coursera\.org\//i));
      const isUdemyLecture = Boolean(tab?.url?.match(/^https:\/\/www\.udemy\.com\/course\/[^/]+\/learn\/lecture\/[^/?#]+/i));
      const isYoutubeWatch = Boolean(tab?.url?.match(/^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?[^#]*\bv=[^&#]+/i));
      if (!isCourseraLecture && !isUdemyLecture && !isYoutubeWatch) {
        setStatus("Abra uma página compatível do Coursera, Udemy ou YouTube", "unavailable");
        return;
      }
      if (isYoutubeWatch && platformContext.requested === "off") {
        setStatus("YouTube detectado · ative o adaptador no card Plataforma", "unavailable");
        return;
      }

      const status = await sendToContent({ type: "SIA_GET_STATUS" });
      if (status?.reason === "content-context-invalidated") {
        setStatus("Reabra a aba da aula para atualizar a extensão", "paused");
      } else if (status?.ok === false) {
        setStatus(status.message || "A aba da aula não respondeu", "paused");
      } else if (!status?.videoFound) {

        setStatus("Nenhum vídeo encontrado nesta aula", "unavailable");
      } else if (!settings.sia_enabled) {
        setStatus("S·IA desativada", "unavailable");
      } else if (!status.syncEngineReady) {
        setStatus("Motor de sincronia indisponível nesta aula", "paused");
      } else if (settings.sia_translate_en_pt && status.translationState === "downloading") {
        setStatus("Baixando tradutor local inglês → português…", "checking");
      } else if (settings.sia_translate_en_pt && status.translationState === "unavailable") {
        setStatus("Tradução local requer Chrome 138 ou mais recente", "paused");
      } else if (settings.sia_translate_en_pt && status.translationError) {
        setStatus("Tradução indisponível · lendo a legenda original", "paused");
      } else if (status.speechError) {
        const errors = {
          "not-allowed": "Voz bloqueada pelo navegador",
          "synthesis-unavailable": "Síntese de voz indisponível",
          "voice-unavailable": "Voz selecionada indisponível"
        };
        setStatus(errors[status.speechError] || "Falha temporária na síntese de voz", "paused");
      } else if (status.voiceEngine === "piper-local" && status.audioState === "blocked") {
        setStatus("Piper aguardando gesto · clique dentro do vídeo", "paused");
      } else if (status.voiceEngine === "piper-local" && status.audioState === "awaiting-gesture") {
        setStatus("Piper preparado · clique dentro do vídeo para liberar o áudio", "checking");
      } else if (status.ended) {
        setStatus("Aula finalizada", "paused");
      } else if (status.paused) {
        setStatus("Vídeo pausado", "paused");
      } else if (status.platformId === "youtube" && !status.captionActive) {
        const diagnostic = status.platformDiagnostic || {};
        const reason = String(diagnostic.reason || "").toLowerCase();
        if (reason === "youtube-ad-showing") {
          setStatus("YouTube · aguardando o fim do anúncio", "checking");
        } else if (diagnostic.state === "UNSAFE_TO_SPEAK" || reason.includes("without-confirmed-timing")) {
          setStatus("YouTube · legenda sem timing seguro; leitura bloqueada", "paused");
        } else if (reason.includes("timedtext") || reason.includes("caption-source")) {
          setStatus(`YouTube · legenda temporal indisponível (${diagnostic.reason})`, "paused");
        } else {
          setStatus("YouTube conectado · aguardando legenda temporal", "checking");
        }
      } else if (status.bufferingSentence && !status.speechActive) {
        setStatus("Preparando frase · aguardando pontuação", "connected");
      } else if (status.captionActive) {
        if (status.videoRateAdjusted) {
          setStatus(`Lendo · vídeo adaptado para ${status.videoRate.toFixed(2)}x`, "connected");
        } else if (
          status.syncMode === "accelerate_voice"
          && (
            status.plannedSpeechRate > Number(settings.sia_speed) + 0.05
            || status.estimatedQueueDelay > 0.4
          )
        ) {
          setStatus(
            `Lendo · correção ${status.plannedSpeechRate.toFixed(1)}x · fila ${status.estimatedQueueDelay.toFixed(1)}s`,
            "connected"
          );
        } else if (status.timelineSentenceActive) {
          setStatus(
            `Lendo · frase sincronizada em ${status.effectiveSpeechRate.toFixed(1)}x`,
            "connected"
          );
        } else if (
          status.syncMode === "accelerate_voice"
          && status.effectiveSpeechRate > Number(settings.sia_speed) + 0.05
        ) {
          setStatus(
            `Lendo · base ${Number(settings.sia_speed).toFixed(1)}x → adaptada ${status.effectiveSpeechRate.toFixed(1)}x`,
            "connected"
          );
        } else {
          const strategy = status.syncMode === "slow_video"
            ? "desaceleração automática"
            : "velocidade de voz";
          setStatus(`Lendo · estratégia: ${strategy}`, "connected");
        }
      } else {
        const strategy = status.syncMode === "slow_video"
          ? "desacelerar vídeo"
          : "ajustar voz";
        setStatus(`Conectada · ${strategy}`, "connected");
      }
    }

    function selectedVoice() {
      return speechSynthesis.getVoices().find(
        voice => voice.voiceURI === settings.sia_voice || voice.name === settings.sia_voice
      );
    }

    async function testNeuralVoice() {
      setStatus("Preparando voz neural local…", "checking");

      const primed = await sendToContent({ type: "SIA_PRIME_NEURAL_AUDIO" });
      if (!primed?.ok) {
        setStatus(
          `Áudio neural indisponível: ${primed?.message || "content script não respondeu"}`,
          "paused"
        );
        return false;
      }

      const result = await sendToContent({
        type: "SIA_TEST_NEURAL_VOICE",
        text: "A S IA está pronta para transformar suas aulas em áudio."
      });
      if (result?.ok && result.started) {
        setStatus("Voz neural iniciada na página", "connected");
        return true;
      }

      setStatus(
        `Voz neural indisponível: ${result?.message || result?.reason || "content script não respondeu"}`,
        "paused"
      );
      return false;
    }

    async function testBrowserVoice() {
      setStatus("Preparando voz do navegador…", "checking");
      const voice = selectedVoice();
      const result = await sendToContent({
        type: "SIA_TEST_BROWSER_VOICE",
        text: "A S IA está pronta para transformar suas aulas em áudio.",
        lang: settings.sia_lang,
        rate: Number(settings.sia_speed),
        pitch: Number(settings.sia_pitch),
        volume: Number(settings.sia_volume) / 100,
        voiceURI: voice?.voiceURI || settings.sia_voice,
        voiceName: voice?.name || settings.sia_voice
      });
      if (result?.ok && result.started) {
        setStatus("Voz do navegador iniciada na página", "connected");
        return true;
      }
      setStatus(
        `Voz do navegador indisponível: ${result?.message || result?.reason || "a aba não respondeu"}`,
        "paused"
      );
      return false;
    }

    async function testVoice() {
      if (settings.sia_voice_engine === "piper-local") {
        await testNeuralVoice();
        return;
      }
      await testBrowserVoice();
    }

    async function resetSettings() {
      Object.assign(settings, DEFAULTS);
      await chrome.storage.local.set(DEFAULTS);
      await chrome.storage.local.remove("sia_platform_selections");
      if (courseId) {
        const result = await chrome.storage.local.get("sia_course_profiles");
        const profiles = result.sia_course_profiles || {};
        delete profiles[courseId];
        await chrome.storage.local.set({ sia_course_profiles: profiles });
      }
      await Promise.all(Object.entries(DEFAULTS).map(([key, value]) =>
        sendToContent({ type: "SIA_CONFIG_UPDATE", key, value })
      ));
      speechSynthesis.cancel();
      platformContext = await readPlatformContext();
      render();
      loadVoices();
      showSavedFeedback("Padrões restaurados");
      void updateConnectionStatus();
    }

    ui.platform?.addEventListener("change", () => {
      platformSelectionDirty = true;
      platformContext = {
        ...platformContext,
        requested: ui.platform.value || "off",
        source: "tab"
      };
      renderPlatform();
    });
    ui.platformScope?.addEventListener("change", () => {
      platformSelectionDirty = true;
      platformContext = {
        ...platformContext,
        source: ui.platformScope.checked ? "domain" : "tab"
      };
      renderPlatform();
    });
    ui.applyPlatform?.addEventListener("click", () => void applyPlatformSelection());

    ui.power.addEventListener("click", () => {
      settings.sia_enabled = !settings.sia_enabled;
      renderPower();
      void saveAndSend("sia_enabled", settings.sia_enabled).then(updateConnectionStatus);
    });
    ui.compactToggle.addEventListener("click", () => {
      settings.sia_compact = !settings.sia_compact;
      renderCompactMode();
      renderSummary();
      void chrome.storage.local.set({ sia_compact: settings.sia_compact });
    });
    if (ui.engine) {
      ui.engine.addEventListener("change", () => {
        settings.sia_voice_engine = ui.engine.value || "browser";
        renderSummary();
        void saveAndSend("sia_voice_engine", settings.sia_voice_engine);
      });
    }
    ui.voice.addEventListener("change", () => {
      renderSummary();
      void saveAndSend("sia_voice", ui.voice.value);
    });
    ui.lang.addEventListener("change", () => {
      settings.sia_lang = ui.lang.value;
      settings.sia_voice = "";
      loadVoices();
      void Promise.all([
        saveAndSend("sia_lang", settings.sia_lang, false),
        saveAndSend("sia_voice", "", false)
      ]);
      renderSummary();
      showSavedFeedback();
    });
    ui.translateEnglish?.addEventListener("change", () => {
      settings.sia_translate_en_pt = ui.translateEnglish.checked;
      void saveAndSend("sia_translate_en_pt", settings.sia_translate_en_pt);
    });
    ui.speed.addEventListener("input", () => {
      const value = Number(ui.speed.value);
      ui.speedLabel.value = `${value.toFixed(1)}x`;
      updateRangeFill(ui.speed);
      settings.sia_speed = value;
      renderSummary();
      void saveAndSend("sia_speed", value);
    });
    ui.pitch.addEventListener("input", () => {
      const value = Number(ui.pitch.value);
      ui.pitchLabel.value = value.toFixed(1);
      updateRangeFill(ui.pitch);
      settings.sia_pitch = value;
      renderSummary();
      void saveAndSend("sia_pitch", value);
    });
    ui.volume.addEventListener("input", () => {
      const value = Number(ui.volume.value);
      ui.volumeLabel.value = `${value}%`;
      updateRangeFill(ui.volume);
      settings.sia_volume = value;
      renderSummary();
      void saveAndSend("sia_volume", value);
    });
    ui.sync.forEach(radio => radio.addEventListener("change", () => {
      if (radio.checked) {
        settings.sia_sync = radio.value;
        renderSummary();
        void saveAndSend("sia_sync", radio.value);
      }
    }));
    [
      [ui.speed, "sia_speed"],
      [ui.pitch, "sia_pitch"],
      [ui.volume, "sia_volume"]
    ].forEach(([input, key]) => {
      input.addEventListener("dblclick", () => {
        input.value = DEFAULTS[key];
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    ui.testVoice.addEventListener("click", testVoice);
    ui.replayLast.addEventListener("click", async () => {
      const result = await sendToContent({ type: "SIA_REPLAY_LAST" });
      if (result?.ok) window.close();
      else setStatus("Nenhuma frase disponível para repetir", "paused");
    });
    ui.openCompanion.addEventListener("click", async () => {
      const tab = await activeTab();
      if (!tab?.id) return;
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
        window.close();
      } catch {
        setStatus("Painel lateral indisponível nesta página", "paused");
      }
    });
    ui.reset.addEventListener("click", () => void resetSettings());

    const initialPlatformContext = await readPlatformContext();
    if (!platformSelectionDirty) {
      platformContext = initialPlatformContext;
    }
    render();
    loadVoices();
    void updateConnectionStatus();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    setInterval(updateConnectionStatus, 1000);
  });
})();
