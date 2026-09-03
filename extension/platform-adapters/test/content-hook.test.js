import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';

const inputSource = fs.readFileSync(new URL('../caption-input.js', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../../sync-engine.js', import.meta.url), 'utf8');
const learningSource = fs.readFileSync(new URL('../../learning/learning-engine.js', import.meta.url), 'utf8');
const contentSource = fs.readFileSync(new URL('../../content.js', import.meta.url), 'utf8');

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}

function createHarness({
  paused = false,
  piperActive = false,
  hostname = 'www.udemy.com',
  pathname = '/course/test/learn/lecture/1',
  textTrack = null,
} = {}) {
  const listeners = new Map();
  const globalListeners = new Map();
  const intervalCallbacks = [];
  const spoken = [];
  const piperSpoken = [];
  const primed = [];
  let now = 1000;
  const video = {
    currentTime: 10.5,
    playbackRate: 1,
    paused,
    ended: false,
    duration: 120,
    playCalls: 0,
    pauseCalls: 0,
    textTracks: textTrack ? [textTrack] : [],
    closest() {
      return null;
    },
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener);
    },
    play() {
      this.paused = false;
      this.playCalls += 1;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      this.pauseCalls += 1;
      this.dispatch("pause");
    },
    dispatch(name) {
      for (const listener of listeners.get(name) || []) listener();
    },
  };
  const documentRef = {
    readyState: 'complete',
    querySelector(selector) {
      return selector === 'video' ? video : null;
    },
    addEventListener() {},
  };
  const storageValues = {
    sia_enabled: true,
    sia_lang: 'pt-BR',
    sia_speed: 1.2,
    sia_voice_engine: 'browser',
  };
  const storage = {
    get(keys, callback) {
      const result = { ...storageValues };
      if (typeof callback === 'function') {
        callback(result);
        return;
      }
      return Promise.resolve(result);
    },
    set(value, callback) {
      Object.assign(storageValues, value || {});
      callback?.();
      return Promise.resolve();
    },
    remove(key, callback) {
      const keysToRemove = Array.isArray(key) ? key : [key];
      keysToRemove.forEach(item => delete storageValues[item]);
      callback?.();
      return Promise.resolve();
    },
  };
  let messageListener = null;
  const chrome = {
    storage: { local: storage },
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        }
      }
    },
  };
  const speechSynthesis = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => [],
    speak(utterance) {
      spoken.push(utterance);
      utterance.onstart?.();
    },
    cancel() {},
    addEventListener() {},
  };
  const context = vm.createContext({
    console,
    chrome,
    document: documentRef,
    location: { hostname, pathname, href: `https://${hostname}${pathname}` },
    URL,
    performance: { now: () => now },
    HTMLElement: class {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis,
    setInterval(callback) {
      intervalCallbacks.push(callback);
      return intervalCallbacks.length;
    },
    clearInterval: () => {},
    setTimeout: callback => { callback(); return 1; },
    clearTimeout: () => {},
    SiaPiperVoiceStatus: () => ({
      engine: piperActive ? 'piper-local' : 'browser',
      state: piperActive ? 'ready' : 'idle',
      audioState: piperActive ? 'running' : 'idle',
      audioError: ''
    }),
    SiaPiperVoice: {
      isActive: () => piperActive,
      speak(utterance) {
        piperSpoken.push(utterance);
        utterance.onstart?.();
        return true;
      },
      primeText(utterance) {
        primed.push(utterance);
        return true;
      },
      cancel() {}
    },
    addEventListener(name, listener) {
      if (!globalListeners.has(name)) globalListeners.set(name, new Set());
      globalListeners.get(name).add(listener);
    },
    removeEventListener(name, listener) {
      globalListeners.get(name)?.delete(listener);
    },
  });
  context.globalThis = context;
  vm.runInContext(syncSource, context);
  vm.runInContext(learningSource, context);
  vm.runInContext(inputSource, context);
  vm.runInContext(contentSource, context);
  return {
    context,
    input: context.SiaCaptionInput,
    video,
    spoken,
      piperSpoken,
      primed,
      setNow(value) {
        now = Number(value);
      },
      tick() {
        for (const callback of intervalCallbacks) callback();
      },
      finishPiper(index = 0) {
        piperSpoken[index]?.onend?.();
      },
    sendMessage(message) {
      return new Promise(resolve => {
        if (!messageListener) {
          resolve({ ok: false, reason: 'message-listener-missing' });
          return;
        }
        messageListener(message, {}, resolve);
      });
    }
  };
}

function cue(overrides = {}) {
  return {
    platformId: 'udemy',
    adapterVersion: 'udemy-v0-experimental',
    text: 'Uma cue segura para falar.',
    startTime: 10,
    endTime: 12,
    source: 'texttrack',
    sourceConfidence: 'high',
    playerIdentity: { videoId: 'lecture-1', containerId: 'shaka-video-container-1' },
    safeToSpeak: true,
    ...overrides,
  };
}

test('H3 cue segura chega ao mesmo caminho de fala do content script', () => {
  const harness = createHarness();
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue());
  assert.equal(result.accepted, true);
  assert.equal(harness.spoken.length, 1);
  assert.equal(harness.spoken[0].text, 'Uma cue segura para falar.');
  assert.equal(harness.spoken[0].lang, 'pt-BR');
});

test('MVP pedagógico cria marcação e cartão sem alterar o caminho de voz', async () => {
  const harness = createHarness();
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue({ text: 'Uma ideia importante para revisar.' }));
  assert.equal(result.accepted, true);
  assert.equal(harness.spoken.length, 1);

  const current = await harness.sendMessage({ type: 'SIA_GET_STUDY_CONTEXT' });
  assert.equal(current.ok, true);
  assert.equal(current.currentCue.text, 'Uma ideia importante para revisar.');
  assert.equal(current.bookmarks.length, 0);

  const created = await harness.sendMessage({
    type: 'SIA_CREATE_STUDY_BOOKMARK',
    bookmarkType: 'important',
  });
  assert.equal(created.ok, true);
  assert.equal(created.bookmark.texto, 'Uma ideia importante para revisar.');
  assert.ok(created.card?.id);
  assert.equal(harness.spoken.length, 1);

  const afterCreate = await harness.sendMessage({ type: 'SIA_GET_STUDY_CONTEXT' });
  assert.equal(afterCreate.cards.length, 1, JSON.stringify(afterCreate));
  assert.equal(afterCreate.cards[0].id, created.card.id);

  const reviewed = await harness.sendMessage({
    type: 'SIA_REVIEW_STUDY_CARD',
    cardId: created.card.id,
    rating: 'remembered',
    answer: 'Uma ideia importante para revisar.',
  });
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
  assert.equal(reviewed.card.ultimaAvaliacao, 'remembered');
  assert.equal(reviewed.card.ultimaResposta, 'Uma ideia importante para revisar.');
  assert.equal(reviewed.card.intervaloDias, 1);

  const cleared = await harness.sendMessage({ type: 'SIA_CLEAR_STUDY' });
  assert.equal(cleared.ok, true, JSON.stringify(cleared));
  const afterClear = await harness.sendMessage({ type: 'SIA_GET_STUDY_CONTEXT' });
  assert.equal(afterClear.bookmarks.length, 0);
  assert.equal(afterClear.cards.length, 0);
});

test('cue sobreposta descartada pela deduplicação não substitui a cue de estudo', async () => {
  const harness = createHarness();
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const first = harness.input.push(cue({ text: 'Uma frase segura para estudo.' }));
  assert.equal(first.accepted, true);
  const overlapped = harness.input.push(cue({
    text: 'estudo.',
    startTime: 10.1,
    endTime: 12.1,
  }));
  assert.equal(overlapped.accepted, true);
  assert.equal(harness.spoken.length, 1);
  const current = await harness.sendMessage({ type: 'SIA_GET_STUDY_CONTEXT' });
  assert.equal(current.currentCue.text, 'Uma frase segura para estudo.');
  assert.equal(current.currentCue.startTime, 10);
});

test('H3 cue insegura não alcança a fala do content script', () => {
  const harness = createHarness();
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue({
    source: 'dom-caption',
    sourceConfidence: 'low',
    startTime: null,
    endTime: null,
    safeToSpeak: false,
  }));
  assert.equal(result.accepted, false);
  assert.equal(harness.spoken.length, 0);
});

test('H4 pausa do vídeo impede cue segura de chegar à fala', () => {
  const harness = createHarness({ paused: true });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  harness.input.setPaused(true);
  const result = harness.input.push(cue());
  assert.equal(result.accepted, false);
  assert.equal(result.reason, harness.input.REASONS.PAUSED);
  assert.equal(harness.spoken.length, 0);
});

test('H5 cue TextTrack usa voz nativa quando Piper está indisponível', () => {
  const harness = createHarness({ piperActive: false });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue());
  assert.equal(result.accepted, true);
  assert.equal(harness.spoken.length, 1);
  assert.equal(harness.piperSpoken.length, 0);
  assert.equal(harness.spoken[0].lang, 'pt-BR');
});

test('H6 cue TextTrack usa Piper compartilhado quando selecionado', () => {
  const harness = createHarness({ piperActive: true });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue());
  assert.equal(result.accepted, true);
  assert.equal(harness.spoken.length, 0);
  assert.equal(harness.piperSpoken.length, 1);
  assert.equal(harness.piperSpoken[0].lang, 'pt-BR');
});

test('H7 cue temporal do Shaka usa Piper compartilhado quando ativo', () => {
  const harness = createHarness({ piperActive: true });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue({ source: 'shaka-caption' }));
  assert.equal(result.accepted, true);
  assert.equal(harness.piperSpoken.length, 1);
  assert.equal(harness.spoken.length, 0);
  assert.equal(harness.piperSpoken[0].lang, 'pt-BR');
});

test('H7 cue temporal do Shaka faz fallback nativo quando Piper está indisponível', () => {
  const harness = createHarness({ piperActive: false });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue({ source: 'shaka-caption' }));
  assert.equal(result.accepted, true);
  assert.equal(harness.spoken.length, 1);
  assert.equal(harness.piperSpoken.length, 0);
  assert.equal(harness.spoken[0].lang, 'pt-BR');
});

test('YouTube cue agregada chega ao mesmo núcleo de voz nativa', () => {
  const harness = createHarness({
    hostname: 'www.youtube.com',
    pathname: '/watch?v=youtube-cue-1',
    piperActive: false,
  });
  harness.input.registerPlatform('youtube');
  harness.input.setActivePlayer({ videoId: 'youtube-cue-1', containerId: 'movie_player' });
  const result = harness.input.push(cue({
    platformId: 'youtube',
    adapterVersion: 'youtube-v0-experimental',
    source: 'youtube-aggregated',
    playerIdentity: { videoId: 'youtube-cue-1', containerId: 'movie_player' },
  }));
  assert.equal(result.accepted, true);
  assert.equal(harness.spoken.length, 1);
  assert.equal(harness.piperSpoken.length, 0);
  assert.equal(harness.spoken[0].lang, 'pt-BR');
});

test('status do YouTube expõe estado de áudio e diagnóstico do núcleo compartilhado', async () => {
  const harness = createHarness({
    hostname: 'www.youtube.com',
    pathname: '/watch?v=youtube-status-1',
    piperActive: true,
  });
  const status = await harness.sendMessage({ type: 'SIA_GET_STATUS' });
  assert.equal(status.voiceEngine, 'piper-local');
  assert.equal(status.voiceEngineState, 'ready');
  assert.equal(status.audioState, 'running');
  assert.equal(status.audioError, '');
  assert.ok(Object.prototype.hasOwnProperty.call(status, 'platformDiagnostic'));
});

test('YouTube cue agregada usa o Piper compartilhado quando ativo', () => {
  const harness = createHarness({
    hostname: 'www.youtube.com',
    pathname: '/watch?v=youtube-cue-2',
    piperActive: true,
  });
  harness.input.registerPlatform('youtube');
  harness.input.setActivePlayer({ videoId: 'youtube-cue-2', containerId: 'movie_player' });
  const result = harness.input.push(cue({
    platformId: 'youtube',
    adapterVersion: 'youtube-v0-experimental',
    source: 'youtube-aggregated',
    playerIdentity: { videoId: 'youtube-cue-2', containerId: 'movie_player' },
  }));
  assert.equal(result.accepted, true);
  assert.equal(harness.spoken.length, 0);
  assert.equal(harness.piperSpoken.length, 1);
  assert.equal(harness.piperSpoken[0].lang, 'pt-BR');
});

test('Coursera reconcilia a previsão quando a fala neural termina cedo e reutiliza o precache', async () => {
  const cues = [
    { startTime: 10, endTime: 11, text: 'Primeira frase.' },
    { startTime: 11.1, endTime: 13, text: 'Segunda frase.' },
  ];
  const track = {
    kind: 'subtitles',
    mode: 'showing',
    activeCues: [cues[0]],
    cues,
  };
  const harness = createHarness({
    hostname: 'www.coursera.org',
    pathname: '/learn/test/lecture/1',
    piperActive: true,
    textTrack: track,
  });

  harness.tick();
  assert.equal(harness.piperSpoken.length, 1);
  assert.equal(harness.primed.length, 2);

  harness.finishPiper(0);
  const afterEarlyEnd = await harness.sendMessage({ type: 'SIA_GET_STATUS' });
  assert.equal(afterEarlyEnd.estimatedQueueDelay, 0);

  harness.video.currentTime = 11.1;
  track.activeCues = [cues[1]];
  harness.tick();
  assert.equal(harness.piperSpoken.length, 2);
  assert.equal(harness.piperSpoken[1].rate, harness.primed[1].rate);
});

test('Coursera prepara a primeira cue antes de ela aparecer sem falar antecipadamente', () => {
  const cueInicial = { startTime: 10, endTime: 12, text: 'A primeira fala.' };
  const track = {
    kind: 'subtitles',
    mode: 'showing',
    activeCues: [],
    cues: [cueInicial],
  };
  const harness = createHarness({
    hostname: 'www.coursera.org',
    pathname: '/learn/test/lecture/1',
    piperActive: true,
    textTrack: track,
  });
  harness.video.currentTime = 9.8;

  harness.tick();
  assert.equal(harness.piperSpoken.length, 0);
  assert.equal(harness.primed.length, 1);
  assert.equal(harness.primed[0].text, 'A primeira fala.');

  harness.video.currentTime = 10;
  track.activeCues = [cueInicial];
  harness.tick();
  assert.equal(harness.piperSpoken.length, 1);
  assert.equal(harness.piperSpoken[0].text, 'A primeira fala.');
});

test('Coursera pré-carrega a próxima cue quando ela chega progressivamente', () => {
  const cues = [
    { startTime: 10, endTime: 12, text: 'A primeira frase.' },
    { startTime: 12.1, endTime: 14, text: 'A próxima frase.' },
  ];
  const track = {
    kind: 'subtitles',
    mode: 'showing',
    activeCues: [cues[0]],
    cues: [cues[0]],
  };
  const harness = createHarness({
    hostname: 'www.coursera.org',
    pathname: '/learn/test/lecture/1',
    piperActive: true,
    textTrack: track,
  });

  harness.tick();
  assert.equal(harness.piperSpoken.length, 1);
  assert.equal(harness.primed.length, 1);
  assert.equal(harness.primed[0].text, 'A primeira frase.');

  track.cues = cues;
  harness.tick();
  assert.equal(harness.primed.length, 2);
  assert.equal(harness.primed[1].text, 'A próxima frase.');

  harness.finishPiper(0);
  harness.video.currentTime = 12.1;
  track.activeCues = [cues[1]];
  harness.tick();
  assert.equal(harness.piperSpoken.length, 2);
  assert.equal(harness.piperSpoken[1].text, 'A próxima frase.');
});

test('continuação neural sem pontuação usa pausa curta sem alterar fila ou fallback', () => {
  const cues = [
    { startTime: 10, endTime: 12, text: 'A explicação continua' },
    { startTime: 12.1, endTime: 14, text: 'A frase termina.' },
  ];
  const track = {
    kind: 'subtitles',
    mode: 'showing',
    activeCues: [cues[0]],
    cues: [cues[0]],
  };
  const harness = createHarness({
    hostname: 'www.coursera.org',
    pathname: '/learn/test/lecture/1',
    piperActive: true,
    textTrack: track,
  });

  harness.tick();
  assert.equal(harness.piperSpoken.length, 1);
  assert.equal(harness.piperSpoken[0].text, 'A explicação continua,');
  assert.equal(harness.piperSpoken[0].silenceScale, 0.08);
  assert.equal(harness.spoken.length, 0);

  harness.finishPiper(0);
  harness.video.currentTime = 12.1;
  track.cues = cues;
  track.activeCues = [cues[1]];
  harness.tick();
  assert.equal(harness.piperSpoken.length, 2);
  assert.equal(harness.piperSpoken[1].text, 'A frase termina.');
  assert.equal(harness.piperSpoken[1].silenceScale, 0.2);
});

test('H5 fonte que não é TextTrack', () => {
  const harness = createHarness({ piperActive: true });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue({ source: 'dom-caption' }));
  assert.equal(result.accepted, true);
  assert.equal(harness.spoken.length, 0);
  assert.equal(harness.piperSpoken.length, 0);
});

test('H5 teste do popup fala na aba ativa e retorna início nativo', async () => {
  const harness = createHarness({ piperActive: true });
  const result = await harness.sendMessage({
    type: 'SIA_TEST_BROWSER_VOICE',
    text: 'Teste de voz nativa na aba Udemy.',
    lang: 'pt-BR',
    rate: 1.2,
    pitch: 1,
    volume: 1
  });
  assert.equal(result.ok, true);
  assert.equal(result.started, true);
  assert.equal(result.engine, 'browser');
  assert.equal(harness.spoken.length, 1);
  assert.equal(harness.spoken[0].lang, 'pt-BR');
  assert.equal(harness.piperSpoken.length, 0);
});

test('H6 teste neural do popup usa o bridge compartilhado na aba ativa', async () => {
  const harness = createHarness({ piperActive: true });
  const result = await harness.sendMessage({
    type: 'SIA_TEST_NEURAL_VOICE',
    text: 'Teste de voz neural Piper na aba Udemy.'
  });
  assert.equal(result.ok, true);
  assert.equal(result.started, true);
  assert.equal(result.engine, 'piper-local');
  assert.equal(harness.piperSpoken.length, 1);
  assert.equal(harness.spoken.length, 0);
});

test('revisão da legenda volta ao vídeo, usa o intervalo registrado e não cria fala livre', async () => {
  const harness = createHarness();
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  harness.input.push(cue({ text: 'A aula apresenta o conceito principal.', startTime: 10, endTime: 12 }));
  harness.spoken[0].onend?.();
  harness.input.push(cue({ text: 'O exemplo mostra como aplicar esse conceito.', startTime: 10.1, endTime: 15 }));

  const transcript = await harness.sendMessage({ type: 'SIA_GET_LESSON_TRANSCRIPT' });
  assert.equal(transcript.ok, true, JSON.stringify(transcript));
  assert.equal(transcript.transcricao.totalFrases, 2);
  assert.ok(transcript.transcricao.trechos.every(item => item.texto));

  const before = await harness.sendMessage({ type: 'SIA_GET_LEARNING_CONTEXT' });
  const spokenBefore = harness.spoken.length;
  const replay = await harness.sendMessage({ type: 'SIA_REPLAY_LESSON_TRANSCRIPT' });
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.inicio, 9.95);
  assert.equal(replay.fim, 15);
  assert.equal(harness.video.currentTime, 9.95);
  assert.equal(harness.video.playCalls, 1);
  assert.equal(harness.video.paused, false);
  assert.equal(harness.spoken.length, spokenBefore);

  harness.video.currentTime = 15.36;
  harness.video.dispatch('timeupdate');
  assert.equal(harness.video.paused, true);
  assert.equal(harness.video.pauseCalls, 1);
  assert.equal(harness.video.currentTime, 15.35);
  assert.equal(harness.spoken.length, spokenBefore);

  const after = await harness.sendMessage({ type: 'SIA_GET_LEARNING_CONTEXT' });
  assert.equal(after.history.length, before.history.length);
});

test('revisão contextual preserva a única fila Piper e não sintetiza a transcrição isoladamente', async () => {
  const harness = createHarness({ piperActive: true });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  harness.input.push(cue({ text: 'Fala neural da aula.', startTime: 10, endTime: 12 }));
  const spokenBefore = harness.piperSpoken.length;
  const replay = await harness.sendMessage({ type: 'SIA_REPLAY_LESSON_TRANSCRIPT' });
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(harness.piperSpoken.length, spokenBefore);
  assert.equal(harness.video.playCalls, 1);
});

test('revisão contextual recusa registro sem intervalo temporal seguro', async () => {
  const harness = createHarness();
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  harness.input.push(cue({ text: 'Legenda sem fim confirmado.', startTime: 10, endTime: 0 }));
  const replay = await harness.sendMessage({ type: 'SIA_REPLAY_LESSON_TRANSCRIPT' });
  assert.equal(replay.ok, false, JSON.stringify(replay));
  assert.equal(replay.reason, 'transcript-timing-unavailable');
  assert.equal(harness.video.playCalls, 0);
});

test('limpar histórico remove também a transcrição integral local', async () => {
  const harness = createHarness();
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  harness.input.push(cue({ text: 'Fala que será apagada.', startTime: 10, endTime: 12 }));
  const before = await harness.sendMessage({ type: 'SIA_GET_LESSON_TRANSCRIPT' });
  assert.equal(before.transcricao.totalFrases, 1);

  const cleared = await harness.sendMessage({ type: 'SIA_CLEAR_HISTORY' });
  assert.equal(cleared.ok, true, JSON.stringify(cleared));
  const after = await harness.sendMessage({ type: 'SIA_GET_LESSON_TRANSCRIPT' });
  assert.equal(after.transcricao.totalFrases, 0);
  assert.equal(after.transcricao.texto, '');
});
