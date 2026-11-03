(() => {
  'use strict';
  if (globalThis.SiaWhisperClient) return;
  let session = null;
  let attemptedVideo = '';
  const automaticAfter = Date.now() + 10000;
  const status = text => { if (session?.label) session.label.textContent = text; };
  function stop(reason = 'Reconhecimento encerrado') {
    const old = session;
    session = null;
    globalThis.SiaYoutubeWhisper?.clear?.();
    if (!old) return;
    clearInterval(old.timer);
    old.video.removeEventListener('seeking', old.seek);
    old.box.remove();
    if (old.held && !old.video.ended) void old.video.play().catch(() => {});
    chrome.runtime.sendMessage({ target: 'sia-whisper-cancel' }).catch(() => {});
    window.dispatchEvent(new CustomEvent('SIA_WHISPER_STOPPED', { detail: { reason } }));
  }
  async function prepare(s, start) {
    if (s.busy || session !== s) return;
    s.busy = true;
    const generation = s.generation;
    status('Whisper · preparando transcrição; a primeira utilização baixa o modelo…');
    try {
      const result = await chrome.runtime.sendMessage({ target: 'sia-whisper-window', videoId: s.id, start });
      if (session !== s || generation !== s.generation) return;
      if (!result?.ok) throw new Error(result?.error || 'Serviço local indisponível');
      const data = result.data;
      if (!['en', 'pt'].includes(data.language) && data.cues?.length) throw new Error('Este piloto aceita fala em inglês ou português.');
      if (!Number.isFinite(data.end) || data.end <= start || !Array.isArray(data.cues)) throw new Error('Resposta temporal inválida');
      const next = s.cues.filter(c => c.endTime <= start && c.endTime >= s.video.currentTime - 120).concat(data.cues);
      if (!globalThis.SiaYoutubeWhisper?.set?.({ videoId: s.id, cues: next, language: data.language })) throw new Error('Fonte de legendas indisponível');
      s.cues = next;
      s.ready = data.end;
      s.done = data.done;
      status('Whisper · transcrição preparada até ' + Math.floor(s.ready) + ' s · ' + (data.language || 'silêncio'));
      if (s.held) { s.held = false; void s.video.play().catch(() => {}); }
    } catch (error) {
      if (session === s && generation === s.generation) {
        stop(error.message);
        const box = document.createElement('div');
        box.textContent = 'S·IA Whisper: ' + error.message + ' · O áudio original está disponível.';
        box.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#222;color:white;padding:16px;max-width:420px';
        box.onclick = () => box.remove();
        document.body.append(box);
      }
    } finally { s.busy = false; }
  }
  function tick(s) {
    if (session !== s) return;
    if (new URL(location.href).searchParams.get('v') !== s.id || s.video.ended || !s.video.isConnected) return stop();
    if (!s.done && !s.video.paused && s.video.currentTime >= s.ready - 0.6) {
      s.held = true;
      s.video.pause();
    }
    if (!s.done && s.video.currentTime >= s.ready - 12) void prepare(s, s.ready);
  }
  async function start() {
    if (session) return { ok: true };
    if (!globalThis.SiaYoutubeWhisper) return { ok: false, error: 'Ative a S·IA para YouTube e recarregue a página.' };
    const enabled = await chrome.storage.local.get('sia_enabled');
    if (enabled.sia_enabled === false) return { ok: false, error: 'Ligue a S·IA antes de iniciar o Whisper.' };
    if (globalThis.SiaYoutubeWhisper.hasNative()) return { ok: false, error: 'Há legendas utilizáveis. O fluxo atual foi preservado.' };
    const video = document.querySelector('video');
    const id = new URL(location.href).searchParams.get('v');
    if (!video || !/^[\w-]{11}$/.test(id || '')) return { ok: false, error: 'Abra um vídeo gravado do YouTube.' };
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:2147483647;background:#18221f;color:white;padding:14px;border-radius:10px;max-width:380px;font:14px sans-serif';
    const label = document.createElement('span');
    const button = document.createElement('button');
    button.textContent = 'Parar Whisper';
    button.onclick = () => stop();
    box.append(label, document.createElement('br'), button);
    document.body.append(box);
    const s = { id, video, box, label, cues: [], ready: Math.floor(video.currentTime / 30) * 30, done: false, busy: false, held: !video.paused, generation: 0 };
    session = s;
    attemptedVideo = id;
    if (s.held) video.pause();
    s.seek = () => {
      s.generation++;
      s.ready = Math.floor(video.currentTime / 30) * 30;
      s.cues = [];
      s.done = false;
      globalThis.SiaYoutubeWhisper.clear();
    };
    video.addEventListener('seeking', s.seek);
    s.timer = setInterval(() => tick(s), 250);
    void prepare(s, s.ready);
    return { ok: true };
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type === 'SIA_WHISPER_START') { start().then(reply); return true; }
    if (message?.type === 'SIA_WHISPER_STOP' || message?.type === 'SIA_PLATFORM_DEACTIVATE') stop();
  });
  window.addEventListener('pagehide', () => stop());
  chrome.storage.onChanged.addListener(changes => {
    if (changes.sia_enabled?.newValue === false) stop();
  });
  setInterval(async () => {
    if (session || Date.now() < automaticAfter) return;
    const id = new URL(location.href).searchParams.get('v');
    if (!id || id === attemptedVideo || !globalThis.SiaYoutubeWhisper || globalThis.SiaYoutubeWhisper.hasNative()) return;
    const prefs = await chrome.storage.local.get(['sia_whisper_auto', 'sia_enabled']);
    if (!prefs.sia_whisper_auto || prefs.sia_enabled === false) return;
    const state = await chrome.runtime.sendMessage({ target: 'sia-whisper-configured' }).catch(() => null);
    if (state?.configured) { attemptedVideo = id; await start(); }
  }, 4000);
  globalThis.SiaWhisperClient = { stop };
})();
