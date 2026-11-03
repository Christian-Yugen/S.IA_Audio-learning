import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code = fs.readFileSync(new URL('../youtube/youtube-caption-bridge.js', import.meta.url), 'utf8');
const response = (id, extra = {}) => ({ videoDetails: { videoId: id }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=' + id, languageCode: 'en', ...extra }] } } });
async function run({ current, initial, emptyTranslation = false }) {
  const calls = [], messages = [];
  const context = {
    URL, location: { href: 'https://www.youtube.com/watch?v=current', origin: 'https://www.youtube.com' },
    document: { getElementById: () => ({ getPlayerResponse: () => current }) },
    window: { ytInitialPlayerResponse: initial, postMessage: m => messages.push(m), addEventListener() {}, setInterval() {}, clearInterval() {} },
    SiaYoutubeCaptionParser: { parse: text => text ? [{ text: 'hello', start: 0, end: 2 }] : [] },
    fetch: async url => { calls.push(url); return { ok: true, text: async () => emptyTranslation && new URL(url).searchParams.has('tlang') ? '' : 'captions' }; },
  };
  vm.runInNewContext(code, context);
  await new Promise(resolve => setImmediate(resolve));
  return { calls, messages };
}
test('recovers original timed captions when translated track is empty', async () => {
  const { calls, messages } = await run({ current: response('current'), emptyTranslation: true });
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).searchParams.has('tlang'), false);
  assert.equal(messages.find(m => m.type === 'SIA_YOUTUBE_TIMED_CUES')?.languageCode, 'en');
});
test('uses current player response instead of stale initial video', async () => {
  const { calls } = await run({ current: response('current'), initial: response('old') });
  assert.equal(new URL(calls[0]).searchParams.get('v'), 'current');
});
test('does not request translation when track explicitly disallows it', async () => {
  const { calls } = await run({ current: response('current', { isTranslatable: false }) });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.has('tlang'), false);
});
test('rejects stale initial response when current video has no track', async () => {
  const { calls, messages } = await run({ initial: response('old') });
  assert.equal(calls.length, 0);
  assert.equal(messages.some(m => m.state === 'UNAVAILABLE'), true);
});
