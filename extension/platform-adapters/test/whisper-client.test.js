import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code = fs.readFileSync(new URL('../../whisper/client.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ native = false, result, deferred, automatic = false } = {}) {
  let now = 0;
  let receive, tick, setCalls = [], requests = [];
  const video = { currentTime: 0, paused: false, ended: false, isConnected: true,
    pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); }, addEventListener() {}, removeEventListener() {} };
  const element = () => ({ style: {}, append() {}, remove() {}, textContent: '' });
  const ctx = { URL, console, Date: class extends Date { static now() { return now; } }, location: { href: 'https://www.youtube.com/watch?v=xl4dvczQWOA' },
    document: { querySelector: () => video, createElement: element, body: { append() {} } },
    setInterval(fn) { tick = fn; return 1; }, clearInterval() {}, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    window: { addEventListener() {}, dispatchEvent() {} },
    SiaYoutubeWhisper: { hasNative: () => native, clear() {}, set(data) { setCalls.push(data); return true; } },
    chrome: { storage: { local: { get: async () => ({ sia_enabled: true, sia_whisper_auto: automatic }) }, onChanged: { addListener() {} } }, runtime: {
      onMessage: { addListener(fn) { receive = fn; } },
      sendMessage(message) { requests.push(message); if (message.target === 'sia-whisper-configured') return Promise.resolve({ configured: true }); return message.target === 'sia-whisper-cancel' ? Promise.resolve() : deferred || Promise.resolve(result); }
    } }
  };
  vm.runInNewContext(code, ctx);
  const send = type => new Promise(resolve => receive({ type }, {}, resolve));
  return { ctx, video, send, setNow: value => { now = value; }, tick: () => tick?.(), setCalls, requests };
}
test('keeps existing captions untouched and never starts Whisper when native source is usable', async () => {
  const h = harness({ native: true });
  assert.equal((await h.send('SIA_WHISPER_START')).ok, false);
  assert.equal(h.requests.length, 0);
  assert.equal(h.video.paused, false);
});
test('holds playback while preparing then feeds original-time cues and resumes', async () => {
  let resolve;
  const h = harness({ deferred: new Promise(r => { resolve = r; }) });
  assert.equal((await h.send('SIA_WHISPER_START')).ok, true);
  assert.equal(h.video.paused, true);
  resolve({ ok: true, data: { language: 'en', cues: [{ text: 'Hello', startTime: 1, endTime: 3 }], end: 30, done: false } });
  await flush();
  assert.equal(h.video.paused, false);
  assert.equal(h.setCalls[0].cues[0].startTime, 1);
});
test('stopped session discards a late transcription and restores held playback', async () => {
  let resolve;
  const h = harness({ deferred: new Promise(r => { resolve = r; }) });
  await h.send('SIA_WHISPER_START');
  h.ctx.SiaWhisperClient.stop();
  resolve({ ok: true, data: { language: 'en', cues: [], end: 30, done: false } });
  await flush();
  assert.equal(h.video.paused, false);
  assert.equal(h.setCalls.length, 0);
});
test('service failure restores original playback and does not inject captions', async () => {
  const h = harness({ result: { ok: false, error: 'Whisper unavailable' } });
  await h.send('SIA_WHISPER_START'); await flush();
  assert.equal(h.video.paused, false);
  assert.equal(h.setCalls.length, 0);
});


test('automatic fallback waits for native caption discovery before requesting Whisper', async () => {
  const h = harness({ automatic: true, result: { ok: true, data: { language: 'en', cues: [], end: 30, done: false } } });
  await h.tick();
  assert.equal(h.requests.length, 0);
  h.setNow(12000);
  await h.tick(); await flush();
  assert.equal(h.requests.some(r => r.target === 'sia-whisper-window'), true);
});

test('automatic mode preserves an existing native caption source', async () => {
  const h = harness({ automatic: true, native: true });
  h.setNow(12000);
  await h.tick();
  assert.equal(h.requests.length, 0);
  assert.equal(h.video.paused, false);
});
