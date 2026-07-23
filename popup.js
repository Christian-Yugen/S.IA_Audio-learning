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
      voice: document.getElementById("select-voice"),
      lang: document.getElementById("select-lang"),
      speed: document.getElementById("input-speed"),
      speedLabel: document.getElementById("label-speed"),
      pitch: document.getElementById("input-pitch"),
      pitchLabel: document.getElementById("label-pitch"),
      volume: document.getElementById("input-volume"),
      volumeLabel: document.getElementById("label-volume"),
      sync: [...document.querySelectorAll('input[name="sync-behavior"]')],
      testVoice: document.getElementById("test-voice"),
      reset: document.getElementById("reset-settings"),
      status: document.getElementById("connection-status"),
      saveFeedback: document.getElementById("save-feedback")
    };

    const saved = await chrome.storage.local.get(Object.keys(DEFAULTS));
    const settings = { ...DEFAULTS, ...saved };
    let feedbackTimer = 0;

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
    }

    function updateRangeFill(input) {
      const min = Number(input.min);
      const max = Number(input.max);
      const progress = ((Number(input.value) - min) / (max - min)) * 100;
      input.style.setProperty("--range-progress", `${progress}%`);
    }

    function renderSummary() {
      const selectedVoice = ui.voice.selectedOptions[0]?.textContent || "Automática";
      ui.summaryVoice.textContent = selectedVoice.replace(/\s+—\s+.+$/, "");
      ui.summarySpeed.textContent = `${Number(settings.sia_speed).toFixed(1)}x`;
      ui.summaryAudio.textContent =
        `Pitch ${Number(settings.sia_pitch).toFixed(1)} · ${Number(settings.sia_volume)}%`;
      ui.summarySync.textContent =
        settings.sia_sync === "slow_video" ? "Desacelerar vídeo" : "Ajustar voz";
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
      if (!tab?.id) return null;
      try {
        return await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        return null;
      }
    }

    async function saveAndSend(key, value, showFeedback = true) {
      settings[key] = value;
      await chrome.storage.local.set({ [key]: value });
      await sendToContent({ type: "SIA_CONFIG_UPDATE", key, value });
      if (showFeedback) showSavedFeedback();
    }

    async function updateConnectionStatus() {
      const tab = await activeTab();
      if (!tab?.url?.match(/^https:\/\/([^.]+\.)?coursera\.org\//i)) {
        setStatus("Abra uma aula do Coursera", "unavailable");
        return;
      }

      const status = await sendToContent({ type: "SIA_GET_STATUS" });
      if (!status?.videoFound) {
        setStatus("Nenhum vídeo encontrado nesta página", "unavailable");
      } else if (!settings.sia_enabled) {
        setStatus("S·IA desativada", "unavailable");
      } else if (status.ended) {
        setStatus("Aula finalizada", "paused");
      } else if (status.paused) {
        setStatus("Vídeo pausado", "paused");
      } else if (status.captionActive) {
        if (status.videoRateAdjusted) {
          setStatus(`Lendo · vídeo adaptado para ${status.videoRate.toFixed(2)}x`, "connected");
        } else if (
          status.syncMode === "accelerate_voice"
          && status.effectiveSpeechRate > Number(settings.sia_speed) + 0.05
        ) {
          setStatus(
            `Lendo · voz adaptada para ${status.effectiveSpeechRate.toFixed(1)}x`,
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

    function testVoice() {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        "S IA está pronta para transformar suas aulas em áudio."
      );
      utterance.lang = settings.sia_lang;
      utterance.rate = Number(settings.sia_speed);
      utterance.pitch = Number(settings.sia_pitch);
      utterance.volume = Number(settings.sia_volume) / 100;
      const voice = selectedVoice();
      if (voice) utterance.voice = voice;
      speechSynthesis.speak(utterance);
    }

    async function resetSettings() {
      Object.assign(settings, DEFAULTS);
      await chrome.storage.local.set(DEFAULTS);
      await Promise.all(Object.entries(DEFAULTS).map(([key, value]) =>
        sendToContent({ type: "SIA_CONFIG_UPDATE", key, value })
      ));
      speechSynthesis.cancel();
      render();
      loadVoices();
      showSavedFeedback("Padrões restaurados");
      void updateConnectionStatus();
    }

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
    ui.voice.addEventListener("change", () => {
      renderSummary();
      void saveAndSend("sia_voice", ui.voice.value);
    });
    ui.lang.addEventListener("change", () => {
      settings.sia_lang = ui.lang.value;
      settings.sia_voice = "";
      loadVoices();
      void chrome.storage.local.set({ sia_lang: settings.sia_lang, sia_voice: "" });
      void sendToContent({ type: "SIA_CONFIG_UPDATE", key: "sia_lang", value: settings.sia_lang });
      void sendToContent({ type: "SIA_CONFIG_UPDATE", key: "sia_voice", value: "" });
      renderSummary();
      showSavedFeedback();
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
    ui.reset.addEventListener("click", () => void resetSettings());

    render();
    loadVoices();
    void updateConnectionStatus();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    setInterval(updateConnectionStatus, 1000);
  });
})();
