window.addEventListener('DOMContentLoaded', () => {
  const details = document.createElement('details');
  details.style.cssText = 'margin:12px;padding:12px;border:1px solid #555;border-radius:8px';
  const summary = document.createElement('summary');
  summary.textContent = 'Vídeo sem legendas · Whisper local (experimental)';
  const note = document.createElement('p');
  note.textContent = 'YouTube gravado, inglês/português. Exige o serviço local aberto. Prepara blocos de 30 s e pausa quando faltar transcrição. Ative a tradução inglês → português nos ajustes atuais.';
  const token = document.createElement('input');
  token.type = 'password'; token.placeholder = 'Chave exibida pelo serviço local'; token.autocomplete = 'off'; token.setAttribute('aria-label', 'Chave do Whisper local');
  const autoLabel = document.createElement('label');
  const auto = document.createElement('input'); auto.type = 'checkbox'; auto.checked = true;
  autoLabel.append(auto, document.createTextNode(' Usar automaticamente quando não houver legenda utilizável'));
  chrome.storage.local.get('sia_whisper_auto').then(data => { auto.checked = data.sia_whisper_auto !== false; });
  auto.onchange = () => chrome.storage.local.set({ sia_whisper_auto: auto.checked });
  const start = document.createElement('button'); start.textContent = 'Usar Whisper neste vídeo';
  const stop = document.createElement('button'); stop.textContent = 'Parar';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  start.onclick = async () => {
    try {
      await chrome.storage.local.set({ sia_whisper_auto: auto.checked });
      if (token.value.trim()) await chrome.storage.session.set({ sia_whisper_token: token.value.trim() });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'SIA_WHISPER_START' });
      status.textContent = result?.ok ? 'Preparação iniciada. Acompanhe o estado no vídeo.' : result?.error || 'Não foi possível iniciar.';
      token.value = '';
    } catch { status.textContent = 'Ative a S·IA para YouTube e recarregue a página.'; }
  };
  stop.onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'SIA_WHISPER_STOP' }).catch(() => {});
    status.textContent = 'Whisper encerrado.';
  };
  details.append(summary, note, token, autoLabel, start, stop, status);
  document.body.append(details);
});
