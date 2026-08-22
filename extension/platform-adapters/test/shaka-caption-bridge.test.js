import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../udemy/shaka-caption-bridge.js', import.meta.url), 'utf8');

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

function createHarness({ paused = false, cue = null } = {}) {
  const events = [];
  const windowListeners = new Map();
  const videoListeners = new Map();
  const captionRoot = {};
  if (cue) {
    captionRoot.__reactFiber$fixture = {
      memoizedProps: {
        captionsStore: {
          activeCaption: { activeCues: [cue] },
        },
      },
    };
  }
  const container = {
    id: 'shaka-video-container-1',
    querySelector(selector) {
      return selector.includes('captions-display-container') ? captionRoot : null;
    },
  };
  const video = {
    id: 'lecture-1',
    paused,
    ended: false,
    currentTime: 1,
    closest() { return container; },
    addEventListener(name, listener) {
      videoListeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (videoListeners.get(name) === listener) videoListeners.delete(name);
    },
  };
  const documentRef = {
    querySelector(selector) {
      if (selector === 'video') return video;
      if (selector.includes('captions-display-container')) return captionRoot;
      return null;
    },
  };
  const windowRef = {
    setInterval(callback) {
      callback();
      return 1;
    },
    clearInterval() {},
    addEventListener(name, listener) {
      windowListeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (windowListeners.get(name) === listener) windowListeners.delete(name);
    },
    postMessage(data, origin) {
      events.push({ data, origin });
      return true;
    },
  };
  const context = vm.createContext({
    document: documentRef,
    window: windowRef,
    location: { hostname: 'www.udemy.com', origin: 'https://www.udemy.com' },
    CustomEvent: FakeCustomEvent,
    setInterval: windowRef.setInterval,
    clearInterval: windowRef.clearInterval,
  });
  context.globalThis = context;
  vm.runInContext(source, context);
  return {
    events,
    video,
    sendWindowMessage(event) {
      windowListeners.get('message')?.(event);
    },
  };
}

test('bridge H7 emite cue temporal do store Shaka', () => {
  const harness = createHarness({
    cue: { text: 'Legenda temporal Shaka', startTime: 0.5, endTime: 2 },
  });

  assert.equal(harness.events.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.events[0].data.cue)), {
    platformId: 'udemy',
    adapterVersion: 'udemy-v0-experimental',
    source: 'shaka-caption',
    sourceConfidence: 'high',
    safeToSpeak: true,
    text: 'Legenda temporal Shaka',
    startTime: 0.5,
    endTime: 2,
    playerIdentity: {
      videoId: 'lecture-1',
      containerId: 'shaka-video-container-1',
    },
  });
});

test('bridge H7 retransmite a última cue após handshake do host', () => {
  const harness = createHarness({
    cue: { text: 'Legenda recuperada após handshake', startTime: 0.5, endTime: 2 },
  });

  assert.equal(harness.events.length, 1);
  harness.sendWindowMessage({
    origin: 'https://www.udemy.com',
    data: { type: 'SIA_SHAKA_CAPTION_BRIDGE_READY' },
  });
  assert.equal(harness.events.length, 2);
  assert.deepEqual(harness.events[1].data, harness.events[0].data);
});

test('bridge H7 não emite cue quando o vídeo está pausado', () => {
  const harness = createHarness({
    paused: true,
    cue: { text: 'Não deve falar pausado', startTime: 0.5, endTime: 2 },
  });

  assert.equal(harness.events.length, 0);
});

test('bridge H7 não transforma texto DOM sem timing em cue', () => {
  const harness = createHarness({ cue: null });
  assert.equal(harness.events.length, 0);
});
