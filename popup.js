(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    sia_enabled: true,
    sia_voice: "",
    sia_lang: "pt-BR",
    sia_speed: 1.2,
    sia_pitch: 1,
    sia_volume: 100,
    sia_sync: "accelerate_voice"
  });

  document.addEventListener("DOMContentLoaded", async () => {
    const ui = {
      container: document.querySelector(".container"),
      power: document.getElementById("toggle-power"),
      powerText: document.querySelector(".power-text"),
      voice: document.getElementById("select-voice"),
      lang: document.getElementById("select-lang"),
      speed: document.getElementById("input-speed"),
      speedLabel: document.getElementById("label-speed"),
      pitch: document.getElementById("input-pitch"),
      pitchLabel: document.getElementById("label-pitch"),
      volume: document.getElementById("input-volume"),
      volumeLabel: document.getElementById("label-volume"),
      sync: [...document.querySelectorAll('input[name="sync-behavior"]')]
    };

    const saved = await chrome.storage.local.get(Object.keys(DEFAULTS));
    const settings = { ...DEFAULTS, ...saved };

    function renderPower() {
      const enabled = Boolean(settings.sia_enabled);
      ui.power.classList.toggle("active", enabled);
      ui.power.setAttribute("aria-checked", String(enabled));
      ui.powerText.textContent = enabled ? "ON" : "OFF";
      ui.container.classList.toggle("is-disabled", !enabled);
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
      renderPower();
    }

    function loadVoices() {
      const voices = speechSynthesis.getVoices().slice().sort(
        (a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name)
      );

      ui.voice.replaceChildren();
      ui.voice.append(new Option("Automática (recomendada)", ""));
      voices.forEach(voice => {
        const option = new Option(`${voice.name} — ${voice.lang}`, voice.voiceURI);
        option.dataset.name = voice.name;
        ui.voice.append(option);
      });

      const match = [...ui.voice.options].find(
        option => option.value === settings.sia_voice || option.dataset.name === settings.sia_voice
      );
      ui.voice.value = match?.value || "";
    }

    async function saveAndSend(key, value) {
      settings[key] = value;
      await chrome.storage.local.set({ [key]: value });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "SIA_CONFIG_UPDATE", key, value });
      } catch {
        // A aba ativa pode não executar o content script da extensão.
      }
    }

    ui.power.addEventListener("click", () => {
      settings.sia_enabled = !settings.sia_enabled;
      renderPower();
      void saveAndSend("sia_enabled", settings.sia_enabled);
    });
    ui.voice.addEventListener("change", () => void saveAndSend("sia_voice", ui.voice.value));
    ui.lang.addEventListener("change", () => void saveAndSend("sia_lang", ui.lang.value));
    ui.speed.addEventListener("input", () => {
      const value = Number(ui.speed.value);
      ui.speedLabel.value = `${value.toFixed(1)}x`;
      void saveAndSend("sia_speed", value);
    });
    ui.pitch.addEventListener("input", () => {
      const value = Number(ui.pitch.value);
      ui.pitchLabel.value = value.toFixed(1);
      void saveAndSend("sia_pitch", value);
    });
    ui.volume.addEventListener("input", () => {
      const value = Number(ui.volume.value);
      ui.volumeLabel.value = `${value}%`;
      void saveAndSend("sia_volume", value);
    });
    ui.sync.forEach(radio => radio.addEventListener("change", () => {
      if (radio.checked) void saveAndSend("sia_sync", radio.value);
    }));

    render();
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
  });
})();
