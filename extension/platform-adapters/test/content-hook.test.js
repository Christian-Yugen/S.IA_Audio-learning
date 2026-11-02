import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';

const inputSource = fs.readFileSync(new URL('../caption-input.js', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../../sync-engine.js', import.meta.url), 'utf8');
const learningSource = fs.readFileSync(new URL('../../learning/learning-engine.js', import.meta.url), 'utf8');
const translationSource = fs.readFileSync(new URL('../../translation/translation-engine.js', import.meta.url), 'utf8');
const contentSource = fs.readFileSync(process.env.SIA_CONTENT_SOURCE_PATH || new URL('../../content.js', import.meta.url), 'utf8');

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

class FakeElement {
  getBoundingClientRect() {
    return { width: 100, height: 20, top: 10, left: 10 };
  }
}

function createHarness({
  paused = false,
  volume = 1,
  manualTimers = false,
  piperActive = false,
  hostname = 'www.udemy.com',
  pathname = '/course/test/learn/lecture/1',
  textTrack = null,
  playerRoot = null,
  documentQuerySelector = null,
  translateEnabled = false,
  translatorApi = null,
} = {}) {
  const listeners = new Map();
  const globalListeners = new Map();
  const intervalCallbacks = [];
  const spoken = [];
  const piperSpoken = [];
  const primed = [];
  const engineChanges = [];
  const spatialChanges = [];
  let now = 1000;
  let nextTimerId = 1;
  const pendingTimers = new Map();
  const video = {
    currentTime: 10.5,
    playbackRate: 1,
    volume,
    paused,
    ended: false,
    duration: 120,
    playCalls: 0,
    pauseCalls: 0,
    textTracks: textTrack ? [textTrack] : [],
    closest() {
      return playerRoot || null;
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
      if (typeof documentQuerySelector === 'function') {
        const custom = documentQuerySelector(selector);
        if (custom !== undefined) return custom;
      }
      return selector === 'video' ? video : null;
    },
    addEventListener() {},
  };
  const storageValues = {
    sia_enabled: true,
    sia_lang: 'pt-BR',
    sia_speed: 1.2,
    sia_voice_engine: piperActive ? 'piper-local' : 'browser',
    sia_translate_en_pt: translateEnabled,
    sia_ducking_level: 0.15,
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
    HTMLElement: FakeElement,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis,
    setInterval(callback) {
      intervalCallbacks.push(callback);
      return intervalCallbacks.length;
    },
    clearInterval: () => {},
    setTimeout: (callback, delay = 0) => {
      if (!manualTimers) {
        callback();
        return 1;
      }
      const id = nextTimerId++;
      pendingTimers.set(id, { callback, at: now + Number(delay || 0) });
      return id;
    },
    clearTimeout: id => {
      pendingTimers.delete(id);
    },
    requestAnimationFrame: callback => {
      now += 20;
      callback(now);
      return 1;
    },
    cancelAnimationFrame: () => {},
    Translator: translatorApi,
    SiaPiperVoiceStatus: () => ({
      engine: piperActive ? 'piper-local' : 'browser',
      state: piperActive ? 'ready' : 'idle',
      audioState: piperActive ? 'running' : 'idle',
      audioError: ''
    }),
    SiaPiperVoice: {
      isActive: () => piperActive,
      setActive(value) { engineChanges.push(value); piperActive = value === "piper-local"; },
      setSpatialPosition(...args) { spatialChanges.push({ type: "position", args }); },
      setSpatialAudio(...args) { spatialChanges.push({ type: "enabled", args }); },
      morphSpatialPosition(...args) { spatialChanges.push({ type: "morph", args }); },
      primeAudio() { return Promise.resolve({ ok: true }); },
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
  vm.runInContext(translationSource, context);
  vm.runInContext(inputSource, context);
  vm.runInContext(fs.readFileSync(new URL("../../audio-settings.js", import.meta.url), "utf8"), context);
  vm.runInContext(fs.readFileSync(new URL("../../learning/neuro-director.js", import.meta.url), "utf8"), context);
  vm.runInContext(contentSource, context);
  return {
    context,
    input: context.SiaCaptionInput,
    video,
    spoken,
    piperSpoken,
    primed,
    engineChanges,
    spatialChanges,
    setNow(value) {
      now = Number(value);
    },
    advanceTimers(ms) {
      now += Number(ms || 0);
      const due = [];
      for (const [id, timer] of pendingTimers.entries()) {
        if (timer.at <= now) {
          due.push({ id, callback: timer.callback });
        }
      }
      for (const item of due) {
        pendingTimers.delete(item.id);
        item.callback();
      }
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

test('traduz cue inglesa antes de enviá-la ao núcleo de voz', async () => {
  const harness = createHarness({
    translateEnabled: true,
    translatorApi: {
      availability: async () => 'available',
      create: async () => ({ translate: async () => 'Uma legenda traduzida.' }),
    },
  });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue({ text: 'A translated caption.' }));
  assert.equal(result.accepted, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.spoken.length, 1);
  assert.equal(harness.spoken[0].text, 'Uma legenda traduzida.');
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

test('Coursera compõe e reutiliza o precache para sentenças fragmentadas sem pontuação na primeira cue', () => {
  const cues = [
    { startTime: 10, endTime: 11, text: 'Primeira parte' },
    { startTime: 11, endTime: 12.5, text: 'da frase completa.' },
    { startTime: 13, endTime: 14.5, text: 'Segunda frase independente.' },
  ];
  const track = {
    kind: 'subtitles',
    mode: 'showing',
    activeCues: [],
    cues,
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
  assert.equal(harness.primed[0].text, 'Primeira parte da frase completa.');

  harness.video.currentTime = 10;
  track.activeCues = [cues[0]];
  harness.tick();
  assert.equal(harness.piperSpoken.length, 1);
  assert.equal(harness.piperSpoken[0].text, 'Primeira parte da frase completa.');
  assert.equal(harness.piperSpoken[0].rate, harness.primed[0].rate);
  assert.equal(harness.primed.length, 3);
  assert.equal(harness.primed[2].text, 'Segunda frase independente.');
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

test('Coursera lê legenda do DOM imediatamente após estabilização sem esperar próxima cue ou pontuação', () => {
  let textoDomAtual = 'Primeira legenda traduzida';
  class CaptionElement extends FakeElement {
    get innerText() {
      return textoDomAtual;
    }
    get textContent() {
      return textoDomAtual;
    }
    closest() {
      return null;
    }
  }

  const captionElement = new CaptionElement();
  const root = {
    querySelectorAll(selector) {
      if (selector.includes('.rc-VideoCaptions') && textoDomAtual) {
        return [captionElement];
      }
      return [];
    }
  };

  const harness = createHarness({
    hostname: 'www.coursera.org',
    pathname: '/learn/test/lecture/1',
    piperActive: true,
    playerRoot: root,
  });

  harness.setNow(1000);
  harness.tick();
  assert.equal(harness.piperSpoken.length, 0, 'não deve falar antes da estabilização de 50ms');

  harness.setNow(1060);
  harness.tick();
  assert.equal(harness.piperSpoken.length, 1, 'deve disparar a fala neural imediatamente após 50ms');
  assert.equal(harness.piperSpoken[0].text, 'Primeira legenda traduzida,');

  harness.finishPiper(0);

  // Nova legenda aparece no DOM (sem pontuação final)
  textoDomAtual = 'Segunda legenda traduzida';
  harness.setNow(1200);
  harness.tick();

  harness.setNow(1260);
  harness.tick();
  assert.equal(harness.piperSpoken.length, 2, 'segunda legenda deve disparar imediatamente sem esperar próxima');
  assert.equal(harness.piperSpoken[1].text, 'Segunda legenda traduzida,');
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

test('substitui fala enfileirada não iniciada quando uma nova legenda da tela surge', () => {
  let textoDomAtual = 'Frase antiga que ainda não começou';
  class CaptionElement extends FakeElement {
    get innerText() { return textoDomAtual; }
    get textContent() { return textoDomAtual; }
    closest() { return null; }
  }
  const captionElement = new CaptionElement();
  const root = {
    querySelectorAll(selector) {
      if (selector.includes('.rc-VideoCaptions') && textoDomAtual) {
        return [captionElement];
      }
      return [];
    }
  };

  const harness = createHarness({
    hostname: 'www.coursera.org',
    pathname: '/learn/test/lecture/2',
    piperActive: true,
    playerRoot: root,
  });

  // Frase 1 detectada e estabilizada
  harness.setNow(1000);
  harness.tick();
  harness.setNow(1060);
  harness.tick();
  assert.equal(harness.piperSpoken.length, 1, 'primeira frase enfileirada');
  assert.equal(harness.piperSpoken[0].text, 'Frase antiga que ainda não começou,');

  // Antes da frase 1 iniciar (finishPiper não chamado), uma nova frase 2 surge na tela
  textoDomAtual = 'Frase nova atualizada';
  harness.setNow(1100);
  harness.tick();
  harness.setNow(1160);
  harness.tick();

  // Frase 2 deve assumir imediatamente, substituindo a anterior obsoleta
  assert.equal(harness.piperSpoken.length, 2, 'nova frase deve substituir a anterior sem retenção');
  assert.equal(harness.piperSpoken[1].text, 'Frase nova atualizada,');
});

test('com Piper ativo, nova legenda da tela é enviada diretamente ao Piper sem ficar retida em legendaReserva', () => {
  let textoDomAtual = 'Frase um em reprodução';
  class CaptionElement extends FakeElement {
    get innerText() { return textoDomAtual; }
    get textContent() { return textoDomAtual; }
    closest() { return null; }
  }
  const captionElement = new CaptionElement();
  const root = {
    querySelectorAll(selector) {
      if (selector.includes('.rc-VideoCaptions') && textoDomAtual) {
        return [captionElement];
      }
      return [];
    }
  };

  const harness = createHarness({
    hostname: 'www.coursera.org',
    pathname: '/learn/test/lecture/3',
    piperActive: true,
    playerRoot: root,
  });

  // Frase 1 detectada e iniciada
  harness.setNow(1000);
  harness.tick();
  harness.setNow(1060);
  harness.tick();
  assert.equal(harness.piperSpoken.length, 1);

  // Frase 2 aparece no DOM enquanto a Frase 1 ainda está em fala (não finalizada)
  textoDomAtual = 'Frase dois seguinte na tela';
  harness.setNow(1200);
  harness.tick();
  harness.setNow(1260);
  harness.tick();

  // Frase 2 deve ter sido enviada diretamente ao Piper (length == 2) sem esperar finishPiper ou próxima cue
  assert.equal(harness.piperSpoken.length, 2, 'Frase 2 deve ir diretamente para a fila neural');
  assert.equal(harness.piperSpoken[1].text, 'Frase dois seguinte na tela,');

  // Frase 3 aparece no DOM
  textoDomAtual = 'Frase três terceira na tela';
  harness.setNow(1400);
  harness.tick();
  harness.setNow(1460);
  harness.tick();

  // Frase 3 também vai diretamente para o Piper sem ficar bloqueada em reserva
  assert.equal(harness.piperSpoken.length, 3, 'Frase 3 deve ir diretamente para a fila neural');
  assert.equal(harness.piperSpoken[2].text, 'Frase três terceira na tela,');
});

test('legenda DOM bilíngue (português e inglês) extrai e sintetiza apenas a linha em português', () => {
  const textoBilingue = [
    'As entradas são confusas e espalhadas por sistemas, portanto, o pipeline deve coletá-las de maneira repetível e governada.',
    'The inputs are messy and spread across systems, so the pipeline must collect them in a governed, repeatable way.'
  ].join('\n');

  class BilingualCaptionElement extends FakeElement {
    get innerText() { return textoBilingue; }
    get textContent() { return textoBilingue; }
    closest() { return null; }
  }
  const captionElement = new BilingualCaptionElement();
  const root = {
    querySelectorAll(selector) {
      if (selector.includes('.rc-VideoCaptions')) {
        return [captionElement];
      }
      return [];
    }
  };

  const harness = createHarness({
    hostname: 'www.coursera.org',
    pathname: '/learn/test/lecture/bilingual',
    piperActive: true,
    playerRoot: root,
  });

  harness.setNow(1000);
  harness.tick();
  harness.setNow(1060);
  harness.tick();

  assert.equal(harness.piperSpoken.length, 1, 'deve disparar a fala com a frase selecionada');
  const falado = harness.piperSpoken[0].text;
  assert.ok(falado.includes('As entradas são confusas'), 'deve conter o texto traduzido em português');
  assert.ok(!falado.includes('The inputs are messy'), 'NÃO deve conter o texto em inglês duplicado');
});

test('Coursera: captura da frase ativa na coluna lateral de Transcrição dispara imediatamente e pré-carrega próxima frase', () => {
  class TranscriptPhraseElement extends FakeElement {
    constructor(text, isHighlight = false) {
      super();
      this._text = text;
      this.isHighlight = isHighlight;
      this.nextElementSibling = null;
      this.parentElement = null;
      this.children = [];
    }
    get innerText() { return this._text; }
    get textContent() { return this._text; }
    closest(selector) {
      if (selector.includes('Transcript') || selector.includes('transcript')) return container;
      return null;
    }
  }

  const frase1 = new TranscriptPhraseElement('0:08 Neste vídeo, vamos nos aprofundar um pouco mais.', true);
  const frase2 = new TranscriptPhraseElement('0:15 Vamos examinar o que é o aprendizado supervisionado.', false);
  frase1.nextElementSibling = frase2;

  const container = new FakeElement();
  container.querySelector = (selector) => {
    if (selector.includes('TranscriptHighlight') || selector.includes('highlight') || selector.includes('active')) {
      return frase1;
    }
    return null;
  };
  container.querySelectorAll = (selector) => {
    return [frase1, frase2];
  };

  const harness = createHarness({
    hostname: 'www.coursera.org',
    pathname: '/learn/machine-learning/lecture/intro',
    piperActive: true,
    documentQuerySelector(selector) {
      if (selector.includes('rc-Transcript') || selector.includes('transcript')) {
        return container;
      }
      return undefined;
    }
  });

  harness.setNow(1000);
  // No primeiro tick, sem aguardar estabilidade de debounce do DOM
  harness.tick();

  assert.equal(harness.piperSpoken.length, 1, 'Frase ativa do transcript deve ser falada no mesmo ciclo (imediato)');
  const textoFalado = harness.piperSpoken[0].text;
  assert.ok(textoFalado.includes('Neste vídeo, vamos nos aprofundar'), 'deve conter o texto da frase ativa');
  assert.ok(!textoFalado.includes('0:08'), 'deve sanitizar o timestamp numérico');

  assert.equal(harness.primed.length, 2, 'Deve preparar a frase ativa e antecipar a próxima frase no Piper');
  const textoPrimeAtual = harness.primed[0].text;
  assert.ok(textoPrimeAtual.includes('Neste vídeo, vamos nos aprofundar'), 'deve preparar a frase ativa');
  const textoPrecache = harness.primed[1].text;
  assert.ok(textoPrecache.includes('Vamos examinar o que é o aprendizado supervisionado'), 'deve pré-sintetizar a frase seguinte');
  assert.ok(!textoPrecache.includes('0:15'), 'deve sanitizar o timestamp da frase seguinte');
});

test('audio ducking reduz volume do vídeo ao falar frase nativa e restaura ao pausar', async () => {
  const harness = createHarness({ manualTimers: true, volume: 1 });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });

  assert.equal(harness.video.volume, 1);

  harness.input.push(cue({ text: 'Legenda falada com ducking ativo.' }));
  assert.equal(harness.spoken.length, 1);

  // Volume deve sofrer ducking para 0.15 (15% do volume base)
  assert.equal(Number(harness.video.volume.toFixed(2)), 0.15);

  // Ao pausar o vídeo durante a fala, volume deve ser restaurado imediatamente para 1
  harness.video.pause();
  harness.tick();
  assert.equal(harness.video.volume, 1);
});

test('audio ducking opera com voz neural Piper e preserva ducking entre legendas consecutivas', async () => {
  const harness = createHarness({ manualTimers: true, piperActive: true, volume: 1 });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });

  // Primeira legenda inicia fala neural
  harness.input.push(cue({ text: 'Primeira frase neural com ducking.', startTime: 10, endTime: 12 }));
  assert.equal(harness.piperSpoken.length, 1);
  assert.equal(Number(harness.video.volume.toFixed(2)), 0.15);

  // Primeira fala conclui
  harness.piperSpoken[0].onend?.();
  // Durante o hold timer de 280ms (avançando 100ms), volume permanece em 0.15
  harness.advanceTimers(100);
  assert.equal(Number(harness.video.volume.toFixed(2)), 0.15);

  // Segunda legenda chega dentro da janela de hold e tempo do vídeo avança
  harness.video.currentTime = 12.5;
  harness.input.push(cue({ text: 'Segunda frase contínua neural.', startTime: 12.1, endTime: 14 }));
  assert.equal(harness.piperSpoken.length, 2);
  assert.equal(Number(harness.video.volume.toFixed(2)), 0.15);

  // Segunda fala conclui
  harness.piperSpoken[1].onend?.();
  // Avança o restante do hold timer e tempo de restauração
  harness.advanceTimers(350);

  // Volume deve ser restaurado para 1
  assert.equal(Number(harness.video.volume.toFixed(2)), 1);
});

test('audio ducking desativado via configuração restaura volume imediatamente e expõe status', async () => {
  const harness = createHarness({ manualTimers: true, volume: 0.8 });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });

  harness.input.push(cue({ text: 'Frase com ducking a 80% base.' }));
  // 80% * 0.15 = 0.12
  assert.equal(Number(harness.video.volume.toFixed(2)), 0.12);

  const status = await harness.sendMessage({ type: 'SIA_GET_STATUS' });
  assert.equal(status.duckingActive, true);
  assert.equal(status.duckingEnabled, true);
  assert.equal(status.duckingLevel, 0.15);

  // Desativa ducking via atualização de configuração
  await harness.sendMessage({ type: 'SIA_CONFIG_UPDATE', key: 'sia_ducking', value: false });
  assert.equal(harness.video.volume, 0.8);

  const statusAtualizado = await harness.sendMessage({ type: 'SIA_GET_STATUS' });
  assert.equal(statusAtualizado.duckingEnabled, false);
});





test('regressão 1.11.1: ajustar posição não troca navegador por Piper', async () => {
  const h = createHarness({ piperActive: false });
  h.engineChanges.length = 0;
  await h.sendMessage({ type: 'SIA_CONFIG_UPDATE', key: 'sia_spatial_angle', value: 45 });
  assert.equal(h.context.SiaPiperVoice.isActive(), false);
  assert.deepEqual(h.engineChanges, []);
});

test('regressão 1.11.1: testar ou preparar áudio espacial não ativa motor sem escolha', async () => {
  const h = createHarness({ piperActive: false });
  h.engineChanges.length = 0;
  const prime = await h.sendMessage({ type: 'SIA_PRIME_NEURAL_AUDIO' });
  assert.equal(prime.ok, false);
  const spatial = await h.sendMessage({ type: 'SIA_TEST_SPATIAL_AUDIO', angle: 25, distance: 1 });
  assert.equal(spatial.ok, false);
  assert.equal(h.context.SiaPiperVoice.isActive(), false);
  assert.deepEqual(h.engineChanges, []);
});

test('regressão 1.11.1: modo automático respeita áudio espacial desligado', async () => {
  const h = createHarness({ piperActive: true });
  await h.sendMessage({ type: 'SIA_CONFIG_UPDATE', key: 'sia_neuro_director_active', value: true });
  await h.sendMessage({ type: 'SIA_CONFIG_UPDATE', key: 'sia_spatial_audio', value: false });
  h.spatialChanges.length = 0;
  h.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  h.input.push(cue({ text: 'Importante esta definição é fundamental', source: 'texttrack' }));
  assert.equal(h.piperSpoken.length, 1);
  assert.equal(h.spatialChanges.filter(c => c.type === 'morph').length, 0);
});

test('regressão 1.11.1: automático ajusta a voz quando explicitamente ligado', async () => {
  const h = createHarness({ piperActive: true });
  await h.sendMessage({ type: 'SIA_CONFIG_UPDATE', key: 'sia_spatial_audio', value: true });
  await h.sendMessage({ type: 'SIA_CONFIG_UPDATE', key: 'sia_neuro_director_active', value: true });
  h.spatialChanges.length = 0;
  h.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  h.input.push(cue({ text: 'Importante esta definição é fundamental', source: 'texttrack' }));
  const morph = h.spatialChanges.find(c => c.type === 'morph');
  assert.ok(morph);
  assert.equal(morph.args[1], 0.5);
  assert.equal(morph.args[2], true);
});


function aiGuruHarness(options = {}) {
  const h = createHarness({ hostname: 'www.ai-guru-academy.com', pathname: '/pt-br/fundamentos/how-to-read-this-catalog/', ...options });
  h.input.registerPlatform('ai-guru');
  h.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  return h;
}

test('AI Guru usa a mesma voz nativa e mantém histórico com tempo e identidade da aula', async () => {
  const h = aiGuruHarness();
  h.input.push(cue({ platformId: 'ai-guru', text: 'Uma legenda da aula para ouvir.' }));
  assert.equal(h.spoken.length, 1); assert.equal(h.piperSpoken.length, 0);
  assert.equal(h.spoken[0].lang, 'pt-BR');
  const status = await h.sendMessage({ type: 'SIA_GET_STATUS' }); assert.equal(status.platformId, 'ai-guru');
  const study = await h.sendMessage({ type: 'SIA_GET_LEARNING_CONTEXT' });
  assert.equal(study.history.at(-1).inicio, 10); assert.equal(study.history.at(-1).fim, 12);
  assert.equal(study.history.at(-1).curso, 'ai-guru');
});

test('AI Guru usa Piper compartilhado somente quando selecionado', () => {
  const h = aiGuruHarness({ piperActive: true });
  h.input.push(cue({ platformId: 'ai-guru', text: 'Legenda para a voz neural.' }));
  assert.equal(h.piperSpoken.length, 1); assert.equal(h.spoken.length, 0);
});

test('AI Guru traduz inglês para português no motor de tradução existente', async () => {
  const h = aiGuruHarness({ translateEnabled: true, translatorApi: { availability: async () => 'available', create: async () => ({ translate: async () => 'Uma explicação em português.' }) } });
  h.input.push(cue({ platformId: 'ai-guru', text: 'An explanation in English.' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.spoken.length, 1); assert.equal(h.spoken[0].text, 'Uma explicação em português.');
});

test('AI Guru cancela entrega de tradução antiga ao pausar', async () => {
  let finish;
  const h = aiGuruHarness({ translateEnabled: true, translatorApi: { availability: async () => 'available', create: async () => ({ translate: () => new Promise(resolve => { finish = resolve; }) }) } });
  h.input.push(cue({ platformId: 'ai-guru', text: 'This translation is pending.' }));
  await new Promise(resolve => setImmediate(resolve));
  h.input.setPaused(true); finish('Tradução que chegou após a pausa.');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.spoken.length, 0);
});

test('AI Guru usa o relógio e o volume da mídia ativa no modo Ouvir', async () => {
  const h = aiGuruHarness();
  const audio = { ...h.video, volume: 0.7, currentTime: 10.7 };
  h.context.SiaAiGuruHost = { getMedia: () => audio };
  h.input.push(cue({ platformId: 'ai-guru', text: 'Leitura enquanto o áudio reproduz.' }));
  assert.equal(h.spoken.length, 1); assert.ok(audio.volume < 0.7);
  h.input.setPaused(true); assert.equal(audio.volume, 0.7);
});

test('AI Guru não retraduz uma legenda já em português', async () => {
  let translations = 0;
  const h = aiGuruHarness({ translateEnabled: true, translatorApi: { availability: async () => 'available', create: async () => ({ translate: async () => { translations++; return 'Não deveria traduzir.'; } }) } });
  h.context.SiaAiGuruHost = { getMedia: () => h.video, getCaptionLanguage: () => 'pt-BR' };
  h.input.push(cue({ platformId: 'ai-guru', text: 'Esta legenda já está em português.' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(translations, 0); assert.equal(h.spoken[0].text, 'Esta legenda já está em português.');
});

test('AI Guru: bootstrap real conecta adaptador, roteador e núcleo de voz sem fila paralela', async () => {
  const h = aiGuruHarness({ textTrack: { kind: 'subtitles', language: 'en', mode: 'hidden', cues: [{ text: 'The actual bootstrap caption.', startTime: 10, endTime: 12 }] } });
  h.video.tagName = 'VIDEO'; h.video.hidden = false; h.video.getAttribute = () => '/stream/lesson.mp4'; h.video.querySelectorAll = () => [];
  h.context.document.querySelector = selector => selector.includes('video') ? h.video : null;
  const windowRef = new EventTarget();
  Object.assign(windowRef, { CustomEvent, setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout });
  h.context.window = windowRef;
  for (const name of ['platform-router.js', 'core-event-bridge.js', 'core-diagnostic-state.js', 'youtube/youtube-caption-parser.js', 'ai-guru/ai-guru-adapter.js', 'ai-guru/ai-guru-host.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'), h.context);
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.context.SiaPlatformRouter.getActive().id, 'ai-guru');
  assert.equal(h.spoken.length, 1); assert.equal(h.spoken[0].text, 'The actual bootstrap caption.');
  assert.equal(h.context.SiaCoreDiagnostic.get().platformId, 'ai-guru');
  windowRef.dispatchEvent(new Event('pagehide'));
  assert.equal(h.context.SiaPlatformRouter.getActive(), null);
});
