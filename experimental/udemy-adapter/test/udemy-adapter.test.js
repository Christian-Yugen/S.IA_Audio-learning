import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIDENCE,
  EVENTS,
  SOURCES,
  STATES,
  buildDiagnostic,
  deriveState,
  isUdemyLectureUrl,
  normalizeCue,
  shouldEmitCue,
} from '../src/udemy-adapter-contract.js';
import { UdemyAdapter } from '../src/udemy-adapter.js';

const lectureUrl = 'https://www.udemy.com/course/example/learn/lecture/12345?start=0';

class FakeTextTrack {
  constructor(activeCues = []) {
    this.activeCues = activeCues;
    this.listeners = new Map();
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  removeEventListener(name, listener) {
    if (this.listeners.get(name) === listener) this.listeners.delete(name);
  }

  dispatch(name) {
    this.listeners.get(name)?.();
  }
}

class FakeVideo {
  constructor(id, { textTracks = [], containerId = `shaka-video-container-${id}` } = {}) {
    this.id = id;
    this.textTracks = textTracks;
    this.containerId = containerId;
    this.listeners = new Map();
    this.removedListeners = 0;
  }

  closest() {
    return { id: this.containerId };
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  removeEventListener(name) {
    if (this.listeners.delete(name)) this.removedListeners += 1;
  }
}

function makeDocument(video, captionText = '') {
  const captionNode = { textContent: captionText };
  return {
    documentElement: {},
    querySelector(selector) {
      if (selector.startsWith('video')) return video;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'video') return [video];
      if (selector === '[data-purpose="caption"]' && captionText) return [captionNode];
      return [];
    },
  };
}

function makeAdapter(documentRef, events = []) {
  return new UdemyAdapter({
    documentRef,
    locationRef: { href: lectureUrl },
    windowRef: {},
    emit: (event) => events.push(event),
  });
}

test('reconhece somente URL de aula Udemy compatível', () => {
  assert.equal(isUdemyLectureUrl(lectureUrl), true);
  assert.equal(isUdemyLectureUrl('https://www.udemy.com/course/example/'), false);
  assert.equal(isUdemyLectureUrl('https://evil.example/course/example/learn/lecture/1'), false);
  assert.equal(isUdemyLectureUrl('not-a-url'), false);
});

test('cue DOM sem tempo é explicitamente insegura para fala', () => {
  const cue = normalizeCue({
    text: 'Legenda visível',
    source: SOURCES.DOM_CAPTION,
    sourceConfidence: CONFIDENCE.LOW,
    playerIdentity: { videoId: 'lecture-1', containerId: 'shaka-video-container-1' },
  });
  assert.equal(cue.text, 'Legenda visível');
  assert.equal(cue.startTime, null);
  assert.equal(cue.endTime, null);
  assert.equal(cue.safeToSpeak, false);
  assert.equal(deriveState({ playerFound: true, source: cue.source, confidence: cue.sourceConfidence, hasTemporalCue: false }), STATES.UNSAFE_TO_SPEAK);
});

test('cue TextTrack temporal de alta confiança pode ser normalizada', () => {
  const cue = normalizeCue({
    text: 'Conteúdo temporal',
    startTime: 10,
    endTime: 12.5,
    source: SOURCES.TEXT_TRACK,
    sourceConfidence: CONFIDENCE.HIGH,
  });
  assert.equal(cue.safeToSpeak, true);
  assert.equal(deriveState({ playerFound: true, source: SOURCES.TEXT_TRACK, confidence: CONFIDENCE.HIGH, hasTemporalCue: true }), STATES.PRIMARY_READY);
});

test('diagnóstico nunca libera fala em estado UNSAFE_TO_SPEAK', () => {
  const diagnostic = buildDiagnostic({
    state: STATES.UNSAFE_TO_SPEAK,
    playerFound: true,
    source: SOURCES.DOM_CAPTION,
    confidence: CONFIDENCE.LOW,
    reason: 'visible-text-without-confirmed-timing',
    cue: { safeToSpeak: true },
  });
  assert.equal(diagnostic.safeToSpeak, false);
});

test('deduplicação rejeita a mesma cue e aceita uma mudança temporal', () => {
  const first = normalizeCue({ text: 'A', startTime: 1, endTime: 2, source: SOURCES.TEXT_TRACK, sourceConfidence: CONFIDENCE.HIGH });
  const same = normalizeCue({ text: 'A', startTime: 1, endTime: 2, source: SOURCES.TEXT_TRACK, sourceConfidence: CONFIDENCE.HIGH });
  const next = normalizeCue({ text: 'B', startTime: 2, endTime: 3, source: SOURCES.TEXT_TRACK, sourceConfidence: CONFIDENCE.HIGH });
  assert.equal(shouldEmitCue(first), true);
  assert.equal(shouldEmitCue(same, first), false);
  assert.equal(shouldEmitCue(next, first), true);
});

test('adaptador identifica TextTrack e emite somente CAPTION_CHANGED seguro', () => {
  const events = [];
  const video = new FakeVideo('lecture-1', { textTracks: [{ activeCues: [{ text: 'Cue um', startTime: 0, endTime: 2 }] }] });
  const adapter = makeAdapter(makeDocument(video), events);
  const diagnostic = adapter.scan();
  assert.equal(diagnostic.state, STATES.PRIMARY_READY);
  assert.equal(diagnostic.source, SOURCES.TEXT_TRACK);
  assert.equal(diagnostic.safeToSpeak, true);
  assert.equal(events.filter((event) => event.type === EVENTS.CAPTION_CHANGED).length, 1);
  assert.equal(events.some((event) => event.type === EVENTS.ADAPTER_ERROR), false);
});

test('diagnóstico informa a inspeção do player sem liberar áudio', () => {
  const video = new FakeVideo('lecture-probe');
  const diagnostic = makeAdapter(makeDocument(video, 'Legenda visual sem tempo')).scan();
  assert.equal(diagnostic.probe.documentVideos, 1);
  assert.equal(diagnostic.probe.iframeCount, 0);
  assert.equal(diagnostic.probe.shakaContainers, 0);
  assert.equal(diagnostic.probe.matchedSelector, 'video[data-purpose]');
  assert.equal(diagnostic.safeToSpeak, false);
});

test('adaptador mantém fallback DOM em UNSAFE_TO_SPEAK sem emitir cue de fala', () => {
  const events = [];
  const video = new FakeVideo('lecture-2');
  const adapter = makeAdapter(makeDocument(video, 'Legenda visual sem tempo'), events);
  const diagnostic = adapter.scan();
  assert.equal(diagnostic.state, STATES.UNSAFE_TO_SPEAK);
  assert.equal(diagnostic.source, SOURCES.DOM_CAPTION);
  assert.equal(diagnostic.safeToSpeak, false);
  assert.equal(events.some((event) => event.type === EVENTS.CAPTION_CHANGED), false);
  assert.equal(events.some((event) => event.type === EVENTS.ADAPTER_FALLBACK), true);
});

test('cuechange de TextTrack dispara nova leitura imediata', () => {
  const events = [];
  const track = new FakeTextTrack([]);
  const video = new FakeVideo('lecture-cuechange', { textTracks: [track] });
  const adapter = makeAdapter(makeDocument(video), events);

  adapter.start();
  assert.equal(events.filter((event) => event.type === EVENTS.CAPTION_CHANGED).length, 0);
  assert.equal(track.listeners.size, 1);

  track.activeCues = [{ text: 'Cue liberada após cuechange', startTime: 3, endTime: 5 }];
  track.dispatch('cuechange');

  const captionEvents = events.filter((event) => event.type === EVENTS.CAPTION_CHANGED);
  assert.equal(captionEvents.length, 1);
  assert.equal(captionEvents[0].cue.safeToSpeak, true);
});

test('troca de player remove listeners antigos e não duplica observers', () => {
  const events = [];
  const firstVideo = new FakeVideo('lecture-first');
  const documentRef = makeDocument(firstVideo, 'Primeira legenda');
  const adapter = makeAdapter(documentRef, events);
  adapter.scan();
  assert.equal(firstVideo.listeners.size, 7);
  const secondVideo = new FakeVideo('lecture-second');
  documentRef.querySelector = (selector) => selector.startsWith('video') ? secondVideo : null;
  adapter.scan();
  assert.equal(firstVideo.listeners.size, 0);
  assert.equal(firstVideo.removedListeners, 7);
  assert.equal(secondVideo.listeners.size, 7);
  assert.equal(events.filter((event) => event.type === EVENTS.PLAYER_FOUND).length, 2);
});

test('URL incompatível não encontra player nem inicia fallback', () => {
  const events = [];
  const adapter = new UdemyAdapter({
    documentRef: makeDocument(new FakeVideo('lecture-nope'), 'texto'),
    locationRef: { href: 'https://www.coursera.org/learn/example' },
    windowRef: {},
    emit: (event) => events.push(event),
  });
  const diagnostic = adapter.start();
  assert.equal(diagnostic.state, STATES.IDLE);
  assert.equal(diagnostic.player, 'missing');
  assert.equal(events.length, 0);
});

test('stop destrói o ciclo de vida e impede novas leituras', () => {
  const events = [];
  const video = new FakeVideo('lecture-stop');
  const adapter = makeAdapter(makeDocument(video, 'texto'), events);
  adapter.start();
  adapter.stop();
  assert.equal(video.listeners.size, 0);
  assert.equal(adapter.state, STATES.DESTROYING);
  const count = events.length;
  adapter.scan();
  assert.equal(events.length, count);
});


test('fallback DOM é deduplicado entre scans consecutivos', () => {
  const events = [];
  const video = new FakeVideo('lecture-dedupe');
  const adapter = makeAdapter(makeDocument(video, 'Legenda estável'), events);
  adapter.scan();
  adapter.scan();
  assert.equal(events.filter((event) => event.type === EVENTS.ADAPTER_FALLBACK).length, 1);
  assert.equal(events.filter((event) => event.type === EVENTS.CAPTION_SOURCE_READY).length, 1);
});

test('observer pode ignorar mutações do overlay sem iniciar novo scan', () => {
  const events = [];
  const video = new FakeVideo('lecture-overlay');
  let observerCallback = null;
  class FakeMutationObserver {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  }
  const windowRef = {
    MutationObserver: FakeMutationObserver,
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
  };
  const adapter = new UdemyAdapter({
    documentRef: makeDocument(video, 'Legenda estável'),
    locationRef: { href: lectureUrl },
    windowRef,
    emit: (event) => events.push(event),
  });
  adapter.start();
  const eventCount = events.length;
  observerCallback([{ target: { dataset: { siaDiagnostic: 'true' } } }]);
  assert.equal(events.length, eventCount);
});
