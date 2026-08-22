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

function createHarness({ paused = false, piperActive = false } = {}) {
  const listeners = new Map();
  const spoken = [];
  const piperSpoken = [];
  const video = {
    currentTime: 10.5,
    playbackRate: 1,
    paused,
    ended: false,
    textTracks: [],
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
  const chrome = {
    storage: { local: storage },
    runtime: { onMessage: { addListener() {} } },
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
  const globalListeners = new Map();
  const context = vm.createContext({
    console,
    chrome,
    document: documentRef,
    location: { hostname: 'www.udemy.com', pathname: '/course/test/learn/lecture/1', href: 'https://www.udemy.com/course/test/learn/lecture/1' },
    performance: { now: () => 1000 },
    HTMLElement: class {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis,
    setInterval: () => 1,
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
      primeText() {},
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
  return { context, input: context.SiaCaptionInput, video, spoken, piperSpoken };
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

test('H5 cue TextTrack usa voz nativa mesmo com Piper selecionado globalmente', () => {
  const harness = createHarness({ piperActive: true });
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue());
  assert.equal(result.accepted, true);
  assert.equal(harness.spoken.length, 1);
  assert.equal(harness.piperSpoken.length, 0);
  assert.equal(harness.spoken[0].lang, 'pt-BR');
});

test('H5 fonte que não é TextTrack não alcança a voz nativa', () => {
  const harness = createHarness();
  harness.input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  const result = harness.input.push(cue({ source: 'dom-caption' }));
  assert.equal(result.accepted, true);
  assert.equal(harness.spoken.length, 0);
  assert.equal(harness.piperSpoken.length, 0);
});
