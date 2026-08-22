import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const inputSource = fs.readFileSync(new URL('../caption-input.js', import.meta.url), 'utf8');
const syncSource = fs.readFileSync(new URL('../../sync-engine.js', import.meta.url), 'utf8');
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
    textTracks: textTrack ? [textTrack] : [],
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener);
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
  const storage = {
    get(_keys, callback) {
      callback({ sia_enabled: true, sia_lang: 'pt-BR', sia_speed: 1.2, sia_voice_engine: 'browser' });
    },
    set(_value, callback) {
      callback?.();
    },
    remove(_key, callback) {
      callback?.();
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
  assert.equal(harness.piperSpoken[0].silenceScale, 0.2);
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

test('Coursera reconcilia a previsão quando a fala neural termina cedo e reutiliza o precache', async () => {
  const cues = [
    { startTime: 10, endTime: 11, text: 'A análise começa' },
    { startTime: 11.1, endTime: 13, text: 'com uma continuação final.' },
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

  track.cues.push(cues[1]);
  harness.tick();
  assert.equal(harness.primed.length, 2);

  harness.finishPiper(0);
  const afterEarlyEnd = await harness.sendMessage({ type: 'SIA_GET_STATUS' });
  assert.equal(afterEarlyEnd.estimatedQueueDelay, 0);

  harness.video.currentTime = 11.1;
  track.activeCues = [cues[1]];
  harness.tick();
  assert.equal(harness.piperSpoken.length, 2);
  assert.equal(harness.piperSpoken[1].rate, harness.primed[1].rate);
  assert.equal(harness.piperSpoken[0].silenceScale, 0.08);
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
