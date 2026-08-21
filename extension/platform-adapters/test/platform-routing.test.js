import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const routerSource = fs.readFileSync(new URL('../platform-router.js', import.meta.url), 'utf8');
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
  windowRef.window = windowRef;
  windowRef.setTimeout = setTimeout;
  windowRef.clearTimeout = clearTimeout;
  windowRef.MutationObserver = undefined;
  return windowRef;
}

function loadScripts(windowRef, { bridge = true, router = true } = {}) {
  const context = vm.createContext({
    window: windowRef,
    Event,
    setTimeout,
    clearTimeout,
    console,
  });
  context.globalThis = context;
  if (bridge) vm.runInContext(bridgeSource, context);
  if (router) vm.runInContext(routerSource, context);
  return context;
}

test('a ponte encaminha eventos de observação ao núcleo comum', () => {
  const windowRef = createWindow();
  const context = loadScripts(windowRef, { bridge: true, router: false });
  context.SiaCoreEventBridge.install(windowRef);
  const events = [];
  windowRef.addEventListener('SIA_CORE_EVENT', event => events.push(event.detail));
  windowRef.dispatchEvent(new TestCustomEvent('SIA_PLATFORM_EVENT', {
    detail: {
      type: 'SIA_PLAYER_FOUND',
      platformId: 'udemy',
      playerIdentity: { videoId: 'lecture-1', containerId: 'shaka-video-container-1' },
    },
  }));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'observation');
  assert.equal(events[0].type, 'SIA_PLAYER_FOUND');
});

test('a ponte encaminha apenas cue temporal de alta confiança como safe-cue', () => {
  const windowRef = createWindow();
  const context = loadScripts(windowRef, { bridge: true, router: false });
  context.SiaCoreEventBridge.install(windowRef);
  const events = [];
  windowRef.addEventListener('SIA_CORE_EVENT', event => events.push(event.detail));
  const cue = {
    platformId: 'udemy',
    adapterVersion: 'udemy-v0-experimental',
    text: 'Legenda válida.',
    startTime: 10,
    endTime: 12,
    source: 'texttrack',
    sourceConfidence: 'high',
    safeToSpeak: true,
  };
  windowRef.dispatchEvent(new TestCustomEvent('SIA_PLATFORM_EVENT', {
    detail: { type: 'SIA_CAPTION_CHANGED', platformId: 'udemy', cue },
  }));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'safe-cue');
  assert.equal(events[0].cue.safeToSpeak, true);
});

test('a ponte bloqueia cue DOM sem timing e conserva o diagnóstico inseguro', () => {
  const windowRef = createWindow();
  const context = loadScripts(windowRef, { bridge: true, router: false });
  context.SiaCoreEventBridge.install(windowRef);
  const events = [];
  windowRef.addEventListener('SIA_CORE_EVENT', event => events.push(event.detail));
  windowRef.dispatchEvent(new TestCustomEvent('SIA_PLATFORM_EVENT', {
    detail: {
      type: 'SIA_CAPTION_CHANGED',
      platformId: 'udemy',
      state: 'UNSAFE_TO_SPEAK',
      cue: {
        text: 'Legenda visual sem tempo.',
        startTime: null,
        endTime: null,
        source: 'dom-caption',
        sourceConfidence: 'low',
        safeToSpeak: false,
      },
    },
  }));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'unsafe-cue-blocked');
  assert.equal(events[0].safeToSpeak, false);
  assert.equal(events[0].state, 'UNSAFE_TO_SPEAK');
});

test('o roteador seleciona um adaptador compatível e preserva seu ciclo de vida', async () => {
  const windowRef = createWindow();
  const context = loadScripts(windowRef, { bridge: true, router: true });
  context.SiaCoreEventBridge.install(windowRef);
  const events = [];
  const emitted = [];
  const routerEvents = [];
  windowRef.addEventListener('SIA_PLATFORM_EVENT', event => routerEvents.push(event.detail));
  const adapter = {
    started: 0,
    stopped: 0,
    start() {
      this.started += 1;
      emitted.push({ type: 'SIA_PLATFORM_DETECTED', platformId: 'udemy' });
      return { player: 'missing', state: 'PLATFORM_DETECTED' };
    },
    stop() {
      this.stopped += 1;
    },
  };
  context.SiaPlatformRouter.register({
    id: 'udemy',
    matches: url => url.includes('www.udemy.com/course/'),
    create: async ({ emit }) => ({
      start: () => {
        const result = adapter.start();
        emit(emitted[0]);
        return result;
      },
      stop: () => adapter.stop(),
    }),
  });
  const result = await context.SiaPlatformRouter.start({
    locationRef: { href: 'https://www.udemy.com/course/test/learn/lecture/1' },
    windowRef,
    documentRef: {},
  });
  assert.equal(result.id, 'udemy');
  assert.equal(adapter.started, 1);
  assert.equal(routerEvents.some(event => event.type === 'SIA_PLATFORM_DETECTED'), true);
  context.SiaPlatformRouter.stop();
  assert.equal(adapter.stopped, 1);
});

test('o roteador não inicia adaptador em URL incompatível', async () => {
  const windowRef = createWindow();
  const context = loadScripts(windowRef, { bridge: true, router: true });
  context.SiaCoreEventBridge.install(windowRef);
  let created = false;
  context.SiaPlatformRouter.register({
    id: 'udemy',
    matches: url => url.includes('www.udemy.com/course/'),
    create: async () => {
      created = true;
      return { start() {} };
    },
  });
  const result = await context.SiaPlatformRouter.start({
    locationRef: { href: 'https://example.com/' },
    windowRef,
    documentRef: {},
  });
  assert.equal(result, null);
  assert.equal(created, false);
});

test('o estado diagnóstico comum conserva a fonte e bloqueia cue insegura', () => {
  const windowRef = createWindow();
  const context = vm.createContext({ window: windowRef, Event, console });
  context.globalThis = context;
  vm.runInContext(diagnosticSource, context);
  context.SiaCoreDiagnostic.updateFromEvent({
    type: 'SIA_CAPTION_SOURCE_READY',
    platformId: 'udemy',
    adapterVersion: 'udemy-v0-experimental',
    player: 'found',
    playerIdentity: { videoId: 'lecture-1', containerId: 'shaka-video-container-1' },
    source: 'dom-caption',
    confidence: 'low',
    state: 'UNSAFE_TO_SPEAK',
    safeToSpeak: false,
    reason: 'visible-text-without-confirmed-timing',
  });
  const diagnostic = context.SiaCoreDiagnostic.get();
  assert.equal(diagnostic.platformId, 'udemy');
  assert.equal(diagnostic.player, 'found');
  assert.equal(diagnostic.source, 'dom-caption');
  assert.equal(diagnostic.confidence, 'low');
  assert.equal(diagnostic.state, 'UNSAFE_TO_SPEAK');
  assert.equal(diagnostic.safeToSpeak, false);
});
