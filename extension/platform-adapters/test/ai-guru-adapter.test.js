import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const sources = ['platform-adapters/caption-input.js', 'platform-adapters/youtube/youtube-caption-parser.js', 'platform-adapters/ai-guru/ai-guru-adapter.js']
  .map(name => fs.readFileSync(new URL(name, root), 'utf8'));
const PAGE = 'https://www.ai-guru-academy.com/pt-br/fundamentos/how-to-read-this-catalog/?track=first-steps';
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
class Media extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag; this.hidden = tag === 'AUDIO'; this.paused = true;
    this.ended = false; this.seeking = false; this.currentTime = 10.5;
    this.src = tag === 'AUDIO' ? '/stream/lesson.mp3' : '/stream/lesson.mp4';
    this.textTracks = []; this.tracks = [];
  }
  getAttribute(name) { return name === 'src' ? this.src : null; }
  querySelectorAll() { return this.tracks; }
  fire(name) { this.dispatchEvent(new Event(name)); }
}
function harness({ native = true, src = '/captions/lesson.vtt', fetchRef = null } = {}) {
  const video = new Media('VIDEO'), audio = new Media('AUDIO');
  const track = { kind: 'subtitles', language: 'en', mode: 'disabled', cues: native ? [
    { text: 'A complete caption from the video.', startTime: 10, endTime: 11 },
    { text: 'The next caption.', startTime: 11, endTime: 12 }
  ] : null };
  video.textTracks = [track];
  video.tracks = [{ track, srclang: 'en', getAttribute: () => src }];
  const events = [], accepted = [], intervalCallbacks = [], cleared = [], requests = [];
  const locationRef = { href: PAGE };
  const documentRef = { querySelector: selector => selector.includes(' audio') ? audio : selector.includes(' video') ? video : null };
  const windowRef = { setInterval: fn => { intervalCallbacks.push(fn); return intervalCallbacks.length; }, clearInterval: id => cleared.push(id),
    setTimeout: () => 1, clearTimeout() {} };
  const ctx = vm.createContext({ console, URL, AbortController });
  for (const source of sources) vm.runInContext(source, ctx);
  ctx.SiaCaptionInput.subscribe(event => { if (event.type === ctx.SiaCaptionInput.EVENTS.ACCEPTED) accepted.push(event.cue); });
  const adapter = ctx.SiaAiGuruAdapter.create({ documentRef, locationRef, windowRef, input: ctx.SiaCaptionInput,
    fetchRef: (url, options) => { requests.push({ url, options }); return fetchRef ? fetchRef(url, options) : Promise.reject(new Error('offline')); },
    emit: event => events.push(event) });
  adapter.start();
  return { adapter, api: ctx.SiaAiGuruAdapter, input: ctx.SiaCaptionInput, video, audio, track, locationRef, accepted, events, requests, cleared, intervalCallbacks };
}

test('AI Guru: domínio e rota exatos; não ativa em outros sites ou páginas de índice', () => {
  const h = harness();
  for (const url of [PAGE, PAGE.replace('www.', ''), PAGE.replace('fundamentos', 'padroes')]) assert.equal(h.api.matches(url), true);
  for (const url of [PAGE.replace('https:', 'http:'), PAGE.replace('.com/', '.com.evil/'), PAGE.replace('www.', 'untrusted.'), 'https://www.ai-guru-academy.com/pt-br/trilhas/', 'not-a-url']) assert.equal(h.api.matches(url), false);
  h.adapter.stop();
});
test('AI Guru: usa TextTrack temporal e a entrada compartilhada, sem falar enquanto pausado', () => {
  const h = harness();
  assert.equal(h.track.mode, 'hidden');
  assert.equal(h.accepted.length, 0);
  h.video.paused = false; h.video.fire('play'); h.adapter.tick();
  assert.equal(h.accepted.length, 1);
  assert.equal(h.accepted[0].platformId, 'ai-guru');
  assert.equal(h.accepted[0].sourceConfidence, 'high');
  assert.equal(h.accepted[0].startTime, 10);
  assert.equal(h.accepted[0].endTime, 11);
  assert.equal(h.adapter.getDiagnostic().state, 'PRIMARY_READY');
  h.adapter.stop();
});
test('AI Guru: não antecipa a fala de cue futura e escolhe uma única cue na fronteira', () => {
  const h = harness(); h.video.paused = false;
  h.video.currentTime = 9.9; h.adapter.tick(); assert.equal(h.accepted.length, 0);
  h.video.currentTime = 11; h.adapter.tick(); assert.equal(h.accepted.length, 1);
  assert.equal(h.accepted[0].text, 'The next caption.'); h.adapter.stop();
});
test('AI Guru: pausa e busca reiniciam deduplicação e permitem reler o mesmo trecho', () => {
  const h = harness(); h.video.paused = false; h.video.fire('play');
  h.video.paused = true; h.video.fire('pause'); assert.equal(h.input.getStatus().paused, true);
  h.adapter.tick(); assert.equal(h.accepted.length, 1);
  h.video.paused = false; h.video.fire('play'); assert.equal(h.accepted.length, 2);
  h.video.seeking = true; h.video.fire('seeking'); h.adapter.tick(); assert.equal(h.accepted.length, 2);
  h.video.seeking = false; h.video.fire('seeked'); assert.equal(h.accepted.length, 3); h.adapter.stop();
});
test('AI Guru: acompanha o modo Ouvir usando o relógio do áudio e as legendas da aula', () => {
  const h = harness(); h.video.paused = false; h.video.fire('play');
  h.video.hidden = true; h.audio.hidden = false; h.audio.paused = false; h.audio.currentTime = 11.2;
  h.adapter.tick(); assert.equal(h.adapter.getMedia(), h.audio);
  assert.equal(h.accepted.at(-1).text, 'The next caption.');
  assert.equal(h.accepted.at(-1).playerIdentity.containerId, 'ai-guru-audio'); h.adapter.stop();
});
test('AI Guru: fallback WebVTT é limitado à URL de legendas observada no mesmo site', async () => {
  const h = harness({ native: false, fetchRef: async url => ({ ok: true, url, text: async () => 'WEBVTT\n\n00:00:10.000 --> 00:00:11.000\nA fetched caption.\n' }) });
  h.video.paused = false; await flush();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].url, 'https://www.ai-guru-academy.com/captions/lesson.vtt');
  assert.equal(h.accepted.length, 1); assert.equal(h.accepted[0].text, 'A fetched caption.'); h.adapter.stop();
});
test('AI Guru: rejeita track externa e não converte texto da página em legenda sem tempo', async () => {
  const h = harness({ native: false, src: 'https://example.com/captions/lesson.vtt' }); h.video.paused = false; h.adapter.tick(); await flush();
  assert.equal(h.requests.length, 0); assert.equal(h.accepted.length, 0);
  assert.equal(h.adapter.getDiagnostic().state, 'WAITING_FOR_CAPTIONS'); h.adapter.stop();
});
test('AI Guru: erro de rede degrada com diagnóstico, sem leitura de texto arbitrário', async () => {
  const h = harness({ native: false }); h.video.paused = false; h.adapter.tick(); await flush();
  assert.equal(h.accepted.length, 0); assert.equal(h.adapter.getDiagnostic().state, 'WAITING_FOR_CAPTIONS');
  assert.ok(h.events.some(e => e.reason === 'offline')); h.adapter.stop();
});
test('AI Guru: resultado assíncrono antigo é descartado depois de sair da página', async () => {
  let resolveFetch;
  const h = harness({ native: false, fetchRef: () => new Promise(resolve => { resolveFetch = resolve; }) });
  h.video.paused = false; await flush();
  h.locationRef.href = 'https://www.ai-guru-academy.com/pt-br/trilhas/'; h.adapter.tick();
  resolveFetch({ ok: true, text: async () => 'WEBVTT\n\n00:00:10.000 --> 00:00:11.000\nOld page caption.\n' }); await flush();
  assert.equal(h.accepted.length, 0); assert.equal(h.adapter.getMedia(), null); h.adapter.stop();
});
test('AI Guru: encerra listeners/polling e restaura a faixa que ativou', () => {
  const h = harness(); h.video.paused = false; h.video.fire('play');
  const count = h.accepted.length; h.adapter.stop();
  assert.equal(h.track.mode, 'disabled'); assert.equal(h.cleared.length, 1);
  h.video.currentTime = 11.5; h.video.fire('play'); h.intervalCallbacks[0](); assert.equal(h.accepted.length, count);
});
