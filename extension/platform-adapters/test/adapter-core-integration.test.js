import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createUdemyAdapter } from '../udemy/udemy-adapter.js';

const bridgeSource = fs.readFileSync(new URL('../core-event-bridge.js', import.meta.url), 'utf8');
const diagnosticSource = fs.readFileSync(new URL('../core-diagnostic-state.js', import.meta.url), 'utf8');

class TestCustomEvent extends Event {
  constructor(type, init = {}) {
    super(type);
    this.detail = init.detail;
  }
}

function createWindow() {
  const windowRef = new EventTarget();
  windowRef.CustomEvent = TestCustomEvent;
  windowRef.setInterval = () => 1;
  windowRef.clearInterval = () => {};
  windowRef.setTimeout = () => 1;
  windowRef.clearTimeout = () => {};
  windowRef.MutationObserver = undefined;
  return windowRef;
}

function loadCommonState(windowRef) {
  const context = vm.createContext({ window: windowRef, Event, console, Date });
  context.globalThis = context;
  vm.runInContext(bridgeSource, context);
  vm.runInContext(diagnosticSource, context);
  context.SiaCoreEventBridge.install(windowRef);
  context.SiaCoreDiagnostic.install(windowRef);
  return context;
}

function createVideo({ id = 'lecture-1', textTracks = [] } = {}) {
  const listeners = new Map();
  const container = { id: `shaka-video-container-${id.replace('lecture-', '')}` };
  return {
    id,
    textTracks,
    currentTime: 1,
    paused: false,
    ended: false,
    playbackRate: 1,
    closest: () => container,
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function createDocument({ video, captionText = '' }) {
  const caption = { textContent: captionText };
  return {
    documentElement: {},
    querySelector(selector) {
      if (selector.startsWith('video')) return video;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'video') return video ? [video] : [];
      if (selector.includes('iframe')) return [];
      if (selector.includes('shaka-video-container')) return video ? [{ id: 'shaka-video-container-1' }] : [];
      if (selector.includes('[data-purpose="caption"]') && captionText) return [caption];
      return [];
    },
  };
}

function createAdapterHarness({ video, captionText = '' }) {
  const windowRef = createWindow();
  const context = loadCommonState(windowRef);
  const documentRef = createDocument({ video, captionText });
  const locationRef = { href: 'https://www.udemy.com/course/test/learn/lecture/1' };
  const adapter = createUdemyAdapter({
    documentRef,
    locationRef,
    windowRef,
    emit: event => windowRef.dispatchEvent(new TestCustomEvent('SIA_PLATFORM_EVENT', { detail: event })),
  });
  return { windowRef, context, documentRef, locationRef, adapter };
}

test('adaptador DOM integra diagnóstico sem liberar fala', () => {
  const harness = createAdapterHarness({
    video: createVideo(),
    captionText: 'Legenda visível sem intervalo temporal.',
  });
  const diagnostic = harness.adapter.start();
  const common = harness.context.SiaCoreDiagnostic.get();
  assert.equal(diagnostic.player, 'found');
  assert.equal(diagnostic.source, 'dom-caption');
  assert.equal(diagnostic.state, 'UNSAFE_TO_SPEAK');
  assert.equal(diagnostic.safeToSpeak, false);
  assert.equal(common.platformId, 'udemy');
  assert.equal(common.player, 'found');
  assert.equal(common.source, 'dom-caption');
  assert.equal(common.safeToSpeak, false);
  harness.adapter.stop();
});

test('cue TextTrack temporal é encaminhada como safe-cue, sem chamar áudio', () => {
  const video = createVideo({
    textTracks: [{
      activeCues: [{ text: 'Legenda temporal válida.', startTime: 1, endTime: 3 }],
    }],
  });
  const harness = createAdapterHarness({ video });
  const coreEvents = [];
  harness.windowRef.addEventListener('SIA_CORE_EVENT', event => coreEvents.push(event.detail));
  const diagnostic = harness.adapter.start();
  const common = harness.context.SiaCoreDiagnostic.get();
  assert.equal(diagnostic.source, 'texttrack');
  assert.equal(diagnostic.state, 'PRIMARY_READY');
  assert.equal(diagnostic.safeToSpeak, true);
  assert.equal(common.state, 'PRIMARY_READY');
  assert.equal(common.safeToSpeak, true);
  assert.equal(coreEvents.some(event => event.kind === 'safe-cue'), true);
  harness.adapter.stop();
});

test('troca de player reconcilia a identidade e encerra sem listener residual', () => {
  const video1 = createVideo({ id: 'lecture-1' });
  const video2 = createVideo({ id: 'lecture-2' });
  let currentVideo = video1;
  const harness = createAdapterHarness({ video: video1 });
  harness.documentRef.querySelector = selector => selector.startsWith('video') ? currentVideo : null;
  harness.documentRef.querySelectorAll = selector => {
    if (selector === 'video') return currentVideo ? [currentVideo] : [];
    if (selector.includes('shaka-video-container')) return currentVideo ? [{ id: `shaka-video-container-${currentVideo.id.replace('lecture-', '')}` }] : [];
    return [];
  };
  const events = [];
  harness.windowRef.addEventListener('SIA_CORE_EVENT', event => events.push(event.detail));
  harness.adapter.start();
  assert.equal(video1.listenerCount > 0, true);
  currentVideo = video2;
  harness.adapter.scan();
  assert.equal(video1.listenerCount, 0);
  assert.equal(video2.listenerCount > 0, true);
  harness.adapter.stop();
  assert.equal(video2.listenerCount, 0);
  assert.equal(events.some(event => event.type === 'SIA_PLATFORM_LEFT'), true);
});
