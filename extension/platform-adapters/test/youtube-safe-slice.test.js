import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

import {
  CONFIDENCE,
  SOURCES,
  STATES,
  extractVideoId,
  isYoutubeWatchUrl,
  normalizeCue,
  shouldEmitCue,
} from "../youtube/youtube-adapter-contract.js";
import { createYoutubeAdapter } from "../youtube/youtube-adapter.js";
import { createYoutubeCaptionAggregator } from "../youtube/youtube-caption-aggregator.js";

const parserSource = fs.readFileSync(new URL("../youtube/youtube-caption-parser.js", import.meta.url), "utf8");
const bridgeSource = fs.readFileSync(new URL("../youtube/youtube-caption-bridge.js", import.meta.url), "utf8");

function loadParser(domParser) {
  const context = vm.createContext({ console });
  if (domParser) context.DOMParser = domParser;
  context.globalThis = context;
  vm.runInContext(parserSource, context);
  return context.SiaYoutubeCaptionParser;
}

function loadBridgeMessages(response) {
  const messages = [];
  const listeners = new Map();
  const windowRef = {
    ytInitialPlayerResponse: response,
    addEventListener(name, listener) { listeners.set(name, listener); },
    postMessage(message) { messages.push(message); },
    setInterval() { return 1; },
    clearInterval() {},
  };
  const context = vm.createContext({
    console,
    URL,
    location: { href: "https://www.youtube.com/watch?v=abc123", origin: "https://www.youtube.com" },
    window: windowRef,
    fetch: async () => ({ ok: true, async text() { return "{}"; } }),
  });
  context.globalThis = context;
  context.SiaYoutubeCaptionParser = { parse() { return [{ text: "Olá", startTime: 0, endTime: 1 }]; } };
  vm.runInContext(bridgeSource, context);
  return messages;
}

test("contrato aceita somente watch HTTPS com videoId", () => {
  assert.equal(isYoutubeWatchUrl("https://www.youtube.com/watch?v=abc123"), true);
  assert.equal(isYoutubeWatchUrl("https://m.youtube.com/watch?v=abc123"), true);
  assert.equal(isYoutubeWatchUrl("https://www.youtube.com/shorts/abc123"), false);
  assert.equal(isYoutubeWatchUrl("http://www.youtube.com/watch?v=abc123"), false);
  assert.equal(extractVideoId("https://youtu.be/abc123"), "abc123");
});

test("contrato libera somente cue temporal de alta confiança", () => {
  const safe = normalizeCue({
    text: "Uma legenda temporal.",
    startTime: 1,
    endTime: 3,
    source: SOURCES.TEXT_TRACK,
    sourceConfidence: CONFIDENCE.HIGH,
  });
  const unsafe = normalizeCue({
    text: "Texto apenas visual.",
    startTime: null,
    endTime: null,
    source: SOURCES.OVERLAY,
    sourceConfidence: CONFIDENCE.LOW,
  });
  assert.equal(safe.safeToSpeak, true);
  assert.equal(unsafe.safeToSpeak, false);
  assert.equal(shouldEmitCue(safe, safe), false);
});

test("parser lê JSON3 com proteção XSSI", () => {
  const parser = loadParser();
  const body = String.raw`)]}'
{"events":[{"tStartMs":1000,"dDurationMs":2000,"segs":[{"utf8":"Olá "},{"utf8":"mundo."}]}]}`;
  const cues = parser.parseJson3(body);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, "Olá mundo.");
  assert.equal(cues[0].startTime, 1);
  assert.equal(cues[0].endTime, 3);
});

test("parser lê WebVTT e rejeita cue inválida", () => {
  const parser = loadParser();
  const cues = parser.parseVtt("WEBVTT\n\n00:00.000 --> 00:01.500\nOlá mundo.\n\n00:02.000 --> 00:01.000\ninválida");
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, "Olá mundo.");
  assert.equal(cues[0].startTime, 0);
  assert.equal(cues[0].endTime, 1.5);
});

test("parser usa fallback XML sem chamar DOMParser sob Trusted Types", () => {
  let domParserCalled = false;
  class TrustedTypesBlockedParser {
    parseFromString() {
      domParserCalled = true;
      throw new TypeError("This document requires 'TrustedHTML' assignment. The action has been blocked.");
    }
  }
  const parser = loadParser(TrustedTypesBlockedParser);
  const body = "<transcript><text start=\"1.5\" dur=\"2\">Olá &amp; mundo</text><p t=\"4000\" d=\"1000\"><s>Outra</s> cue</p></transcript>";
  const cues = parser.parseXml(body);
  assert.equal(domParserCalled, false);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "Olá & mundo");
  assert.equal(cues[0].startTime, 1.5);
  assert.equal(cues[0].endTime, 3.5);
  assert.equal(cues[1].text, "Outra cue");
  assert.equal(cues[1].startTime, 4);
  assert.equal(cues[1].endTime, 5);
});

test("agregador une palavras consecutivas e emite uma frase única", () => {
  let now = 1000;
  const aggregator = createYoutubeCaptionAggregator({ now: () => now, stabilityMs: 400, maxGapSeconds: 0.65 });
  assert.deepEqual(aggregator.push({ text: "A", startTime: 1, endTime: 1.2, sequenceId: "1" }, now), []);
  now += 80;
  assert.deepEqual(aggregator.push({ text: "SIA", startTime: 1.4, endTime: 1.6, sequenceId: "2" }, now), []);
  now += 80;
  assert.deepEqual(aggregator.push({ text: "lê", startTime: 1.8, endTime: 2, sequenceId: "3" }, now), []);
  now += 80;
  const emitted = aggregator.push({ text: "legendas.", startTime: 2.2, endTime: 2.5, sequenceId: "4" }, now);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].text, "A SIA lê legendas.");
  assert.equal(emitted[0].source, SOURCES.AGGREGATED);
  assert.equal(emitted[0].safeToSpeak, true);

  assert.deepEqual(aggregator.push({ text: "legendas.", startTime: 2.25, endTime: 2.55, sequenceId: "5" }, now + 20), []);
});

test("agregador une microcues progressivas e elimina repetição", () => {
  const aggregator = createYoutubeCaptionAggregator({ now: () => 1000, stabilityMs: 400 });
  assert.deepEqual(aggregator.push({ text: "A S·IA", startTime: 1, endTime: 1.5, sequenceId: "1" }, 1000), []);
  const emitted = aggregator.push({ text: "A S·IA lê legendas.", startTime: 1.4, endTime: 2.2, sequenceId: "2" }, 1100);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].text, "A S·IA lê legendas.");
  assert.equal(emitted[0].source, SOURCES.AGGREGATED);
  assert.equal(emitted[0].safeToSpeak, true);
});

test("bridge usa fallback IOS local quando Web timedtext retorna vazio", async () => {
  const messages = [];
  const listeners = new Map();
  const fetchCalls = [];
  const windowRef = {
    ytInitialPlayerResponse: {
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { languageCode: "pt-BR", name: { simpleText: "Português (Brasil)" }, baseUrl: "https://www.youtube.com/api/timedtext?lang=pt-BR" },
          ],
        },
      },
    },
    ytcfg: {
      get(key) {
        if (key === "INNERTUBE_API_KEY") return "test-api-key";
        if (key === "INNERTUBE_CONTEXT") return { client: { hl: "pt", gl: "BR", visitorData: "visitor" } };
        return null;
      },
    },
    addEventListener(name, listener) { listeners.set(name, listener); },
    postMessage(message) { messages.push(message); },
    setInterval() { return 1; },
    clearInterval() {},
  };
  const context = vm.createContext({
    console,
    URL,
    location: { href: "https://www.youtube.com/watch?v=abc123", origin: "https://www.youtube.com" },
    window: windowRef,
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      if (String(url).includes("/youtubei/v1/player")) {
        return {
          ok: true,
          async text() {
            return JSON.stringify({ captions: { playerCaptionsTracklistRenderer: { captionTracks: [
              { languageCode: "pt-BR", name: { runs: [{ text: "Português (Brasil)" }] }, baseUrl: "https://www.youtube.com/api/timedtext?lang=pt-BR&client=ios" }
            ] } } });
          },
        };
      }
      return { ok: true, async text() { return fetchCalls.length === 1 ? "web-empty" : "ios-cues"; } };
    },
    setTimeout,
    clearTimeout,
  });
  context.globalThis = context;
  context.SiaYoutubeCaptionParser = {
    parse(body) {
      return body === "ios-cues" ? [{ text: "Olá do IOS", startTime: 1, endTime: 2 }] : [];
    },
  };
  vm.runInContext(bridgeSource, context);
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(fetchCalls.some(call => call.url.includes("/youtubei/v1/player")), true);
  assert.equal(fetchCalls.some(call => call.options.method === "POST"), true);
  assert.equal(messages.some(message => message.type === "SIA_YOUTUBE_TIMED_CUES_STATUS" && message.state === "FALLBACK_FETCHING"), true);
  assert.equal(messages.some(message => message.type === "SIA_YOUTUBE_TIMED_CUES_STATUS" && message.state === "FALLBACK_READY" && message.client === "IOS"), true);
  const snapshot = messages.find(message => message.type === "SIA_YOUTUBE_TIMED_CUES");
  assert.equal(snapshot.source, "youtube-timedtext");
  assert.equal(snapshot.sourceConfidence, "high");
  assert.equal(snapshot.languageCode, "pt-BR");
  assert.equal(snapshot.cues[0].startTime, 1);
});

test("bridge prioriza pt-BR antes de pt genérico", () => {
  const messages = loadBridgeMessages({
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { languageCode: "en", name: { simpleText: "English" }, baseUrl: "https://www.youtube.com/api/timedtext?lang=en" },
          { languageCode: "pt", name: { simpleText: "Português" }, baseUrl: "https://www.youtube.com/api/timedtext?lang=pt" },
          { languageCode: "pt-BR", name: { simpleText: "Português (Brasil)" }, baseUrl: "https://www.youtube.com/api/timedtext?lang=pt-BR" },
        ],
      },
    },
  });
  const fetching = messages.find(message => message.type === "SIA_YOUTUBE_TIMED_CUES_STATUS" && message.state === "FETCHING");
  assert.equal(fetching.languageCode, "pt-BR");
});

test("adapter libera cue temporal estável sem pontuação depois do tempo máximo", () => {
  const track = {
    kind: "captions",
    label: "Português (Brasil)",
    mode: "hidden",
    cues: [{ text: "Esta frase ainda está sendo formada", startTime: 1, endTime: 4 }],
    activeCues: [{ text: "Esta frase ainda está sendo formada", startTime: 1, endTime: 4 }],
    addEventListener() {},
    removeEventListener() {},
  };
  const video = {
    id: "video-stable-cue",
    currentTime: 1.5,
    currentSrc: "youtube-video-stable-cue",
    duration: 10,
    paused: false,
    ended: false,
    textTracks: [track],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  let now = 1000;
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=stablecue" },
    windowRef,
    now: () => now,
    emit: event => events.push(event),
  });
  adapter.start();
  assert.equal(events.some(event => event.type === "SIA_CAPTION_CHANGED"), false);
  now = 8000;
  adapter.scan();
  const emitted = events.find(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(Boolean(emitted), true);
  assert.equal(emitted.cue.source, SOURCES.AGGREGATED);
  assert.equal(emitted.cue.sourceConfidence, CONFIDENCE.HIGH);
  assert.equal(emitted.cue.safeToSpeak, true);
  adapter.stop();
});

test("adapter agrega legenda externa palavra-a-palavra antes de emitir", () => {
  const video = {
    id: "video-word-cues",
    currentTime: 0.3,
    currentSrc: "youtube-video-word-cues",
    duration: 6,
    paused: false,
    ended: false,
    textTracks: [],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=wordcues" },
    windowRef,
    emit: event => events.push(event),
  });
  adapter.start();
  adapter.setExternalTimedCues({
    videoId: "wordcues",
    trackKey: "ios-pt-BR-word-cues",
    cues: [
      { text: "A", startTime: 0.2, endTime: 0.4, sequenceId: "0" },
      { text: "SIA", startTime: 0.8, endTime: 1.0, sequenceId: "1" },
      { text: "lê", startTime: 1.4, endTime: 1.6, sequenceId: "2" },
      { text: "legendas.", startTime: 2.0, endTime: 2.3, sequenceId: "3" },
    ],
  });
  for (const currentTime of [0.3, 0.9, 1.5, 2.1]) {
    video.currentTime = currentTime;
    adapter.scan();
  }
  const emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].cue.text, "A SIA lê legendas.");
  assert.equal(emitted[0].cue.safeToSpeak, true);
  adapter.stop();
});

test("adapter escolhe uma única cue externa quando a tolerância sobrepõe frases consecutivas", () => {
  const video = {
    id: "video-overlapping-window",
    currentTime: 0,
    currentSrc: "youtube-overlapping-window",
    duration: 4,
    paused: false,
    ended: false,
    textTracks: [],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=overlapwindow" },
    windowRef,
    emit: event => events.push(event),
  });
  adapter.start();
  adapter.setExternalTimedCues({
    videoId: "overlapwindow",
    trackKey: "ios-overlap-window",
    cues: [
      { text: "Primeira frase.", startTime: 0.2, endTime: 1.2 },
      { text: "Segunda frase.", startTime: 1.3, endTime: 2.4 },
    ],
  });
  for (const currentTime of [0.4, 1.15, 1.35, 1.5]) {
    video.currentTime = currentTime;
    adapter.scan();
  }
  const emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.deepEqual(emitted.map(event => event.cue.text), ["Primeira frase.", "Segunda frase."]);
  adapter.stop();
});

test("adapter não rebaixa transcript temporal carregado por overlay durante intervalo", () => {
  let overlayVisible = false;
  const video = {
    id: "video-temporal-gap",
    currentTime: 0.4,
    currentSrc: "youtube-temporal-gap",
    duration: 4,
    paused: false,
    ended: false,
    textTracks: [],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) {
      if (selector === "video") return [video];
      if (selector === "#caption-window-1" && overlayVisible) return [{ innerText: "Legenda visual" }];
      return [];
    },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=temporal-gap" },
    windowRef,
    emit: event => events.push(event),
  });
  adapter.start();
  adapter.setExternalTimedCues({
    videoId: "temporal-gap",
    trackKey: "ios-temporal-gap",
    cues: [{ text: "Primeira frase.", startTime: 0.2, endTime: 1.2 }, { text: "Segunda frase.", startTime: 2, endTime: 3 }],
  });
  video.currentTime = 1.5;
  overlayVisible = true;
  const diagnostic = adapter.scan();
  assert.equal(diagnostic.source, SOURCES.NONE);
  assert.equal(diagnostic.state, STATES.WAITING_FOR_CAPTIONS);
  assert.equal(diagnostic.reason, "caption-source-unavailable");
  assert.equal(events.some(event => event.type === "SIA_ADAPTER_FALLBACK"), false);
  adapter.stop();
});

test("adapter emite imediatamente cue temporal externa já fechada", () => {
  const video = {
    id: "video-external-cue",
    currentTime: 5,
    currentSrc: "youtube-video-external",
    duration: 10,
    paused: false,
    ended: false,
    textTracks: [],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=externalcue" },
    windowRef,
    now: () => 1000,
    emit: event => events.push(event),
  });
  adapter.start();
  adapter.setExternalTimedCues({
    videoId: "externalcue",
    trackKey: "ios-pt-BR",
    cues: [{ text: "Cue do IOS.", startTime: 4.3, endTime: 5.5 }],
  });
  adapter.scan();
  const emitted = events.find(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(Boolean(emitted), true);
  assert.equal(emitted.cue.text, "Cue do IOS.");
  assert.equal(emitted.cue.source, SOURCES.AGGREGATED);
  assert.equal(emitted.cue.sourceConfidence, CONFIDENCE.HIGH);
  assert.equal(emitted.cue.safeToSpeak, true);
  adapter.stop();
});

test("adapter percorre cues externas, respeita pausa e relê após seek para trás", () => {
  const video = {
    id: "video-continuous",
    currentTime: 0.5,
    currentSrc: "youtube-video-continuous",
    duration: 6,
    paused: false,
    ended: false,
    textTracks: [],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=continuous" },
    windowRef,
    emit: event => events.push(event),
  });
  adapter.start();
  adapter.setExternalTimedCues({
    videoId: "continuous",
    trackKey: "ios-pt-BR",
    cues: [
      { text: "Primeira cue.", startTime: 0.2, endTime: 1.2 },
      { text: "Segunda cue.", startTime: 1.5, endTime: 3 },
      { text: "Terceira cue.", startTime: 3.3, endTime: 4.5 },
    ],
  });
  adapter.scan();
  video.currentTime = 1.7;
  adapter.scan();
  video.currentTime = 3.5;
  adapter.scan();
  let emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.deepEqual(emitted.map(event => event.cue.text), ["Primeira cue.", "Segunda cue.", "Terceira cue."]);

  video.paused = true;
  video.currentTime = 1.7;
  adapter.scan();
  assert.equal(events.filter(event => event.type === "SIA_CAPTION_CHANGED").length, 3);

  video.paused = false;
  adapter.scan();
  emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.deepEqual(emitted.map(event => event.cue.text), ["Primeira cue.", "Segunda cue.", "Terceira cue.", "Segunda cue."]);

  video.currentTime = 0.5;
  adapter.scan();
  emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.deepEqual(emitted.map(event => event.cue.text), ["Primeira cue.", "Segunda cue.", "Terceira cue.", "Segunda cue.", "Primeira cue."]);
  adapter.stop();
});

test("adapter limpa estado em troca de vídeo YouTube e aceita apenas a cue nova", () => {
  const locationRef = { href: "https://www.youtube.com/watch?v=first-video" };
  const video = {
    id: "video-spa",
    currentTime: 0.5,
    currentSrc: "youtube-first-video",
    duration: 6,
    paused: false,
    ended: false,
    textTracks: [],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({ documentRef, locationRef, windowRef, emit: event => events.push(event) });
  adapter.start();
  adapter.setExternalTimedCues({
    videoId: "first-video",
    trackKey: "ios-pt-BR-first",
    cues: [{ text: "Cue do primeiro vídeo.", startTime: 0.2, endTime: 1.2 }],
  });
  adapter.scan();

  locationRef.href = "https://www.youtube.com/watch?v=second-video";
  video.currentSrc = "youtube-second-video";
  video.currentTime = 0.5;
  adapter.scan();
  adapter.setExternalTimedCues({
    videoId: "second-video",
    trackKey: "ios-pt-BR-second",
    cues: [{ text: "Cue do segundo vídeo.", startTime: 0.2, endTime: 1.2 }],
  });
  adapter.scan();

  const emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.deepEqual(emitted.map(event => event.cue.text), ["Cue do primeiro vídeo.", "Cue do segundo vídeo."]);
  assert.equal(emitted[1].cue.playerIdentity.videoId, "second-video");
  adapter.stop();
});

test("adapter não repete cue quando a qualidade muda o currentSrc do mesmo vídeo", () => {
  const locationRef = { href: "https://www.youtube.com/watch?v=same-video" };
  const video = {
    id: "video-quality-switch",
    currentTime: 0.5,
    currentSrc: "stream-quality-360p",
    duration: 6,
    paused: false,
    ended: false,
    textTracks: [],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({ documentRef, locationRef, windowRef, emit: event => events.push(event) });
  adapter.start();
  adapter.setExternalTimedCues({
    videoId: "same-video",
    trackKey: "ios-pt-BR-same",
    cues: [{ text: "Uma única frase.", startTime: 0.2, endTime: 1.2 }],
  });
  adapter.scan();
  video.currentSrc = "stream-quality-720p";
  adapter.scan();
  video.currentSrc = "stream-quality-1080p";
  adapter.scan();
  const emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].cue.text, "Uma única frase.");
  adapter.stop();
});

test("adapter bloqueia cue durante anúncio e retoma após o anúncio", () => {
  let adShowing = true;
  const video = {
    id: "video-ad",
    currentTime: 0.5,
    currentSrc: "youtube-video-ad",
    duration: 6,
    paused: false,
    ended: false,
    textTracks: [],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) {
      if (selector.includes("ad-showing") && adShowing) return {};
      return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null;
    },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=ad-video" },
    windowRef,
    emit: event => events.push(event),
  });
  adapter.start();
  adapter.setExternalTimedCues({
    videoId: "ad-video",
    trackKey: "ios-pt-BR-ad",
    cues: [{ text: "Cue após anúncio.", startTime: 0.2, endTime: 1.2 }],
  });
  adapter.scan();
  assert.equal(events.some(event => event.type === "SIA_CAPTION_CHANGED"), false);
  assert.equal(adapter.getDiagnostic().reason, "youtube-ad-showing");

  adShowing = false;
  adapter.scan();
  let emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(emitted.length, 1);
  adapter.scan();
  emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(emitted.length, 1);
  adapter.stop();
});

test("adapter preserva buffer de TextTrack fragmentado durante intervalo e fala frase única", () => {
  const listeners = new Map();
  const track = {
    kind: "captions",
    label: "Português (Brasil)",
    mode: "hidden",
    cues: [],
    activeCues: [],
    addEventListener(name, listener) { listeners.set(`track:${name}`, listener); },
    removeEventListener() {},
  };
  track.cues = [
    { text: "A", startTime: 0.2, endTime: 0.4, sequenceId: "0" },
    { text: "SIA", startTime: 0.8, endTime: 1.0, sequenceId: "1" },
    { text: "lê", startTime: 1.4, endTime: 1.6, sequenceId: "2" },
    { text: "legendas.", startTime: 2.0, endTime: 2.3, sequenceId: "3" },
  ];
  const video = {
    id: "video-native-word-cues",
    currentTime: 0.3,
    currentSrc: "youtube-video-native-word-cues",
    duration: 6,
    paused: false,
    ended: false,
    textTracks: [track],
    addEventListener(name, listener) { listeners.set(`video:${name}`, listener); },
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=nativewordcues" },
    windowRef,
    now: () => 1000,
    emit: event => events.push(event),
  });
  adapter.start();
  for (const [currentTime, activeCues] of [
    [0.3, [track.cues[0]]],
    [0.55, []],
    [0.9, [track.cues[1]]],
    [1.5, [track.cues[2]]],
    [2.1, [track.cues[3]]],
  ]) {
    video.currentTime = currentTime;
    track.activeCues = activeCues;
    adapter.scan();
  }
  const emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].cue.text, "A SIA lê legendas.");
  assert.equal(emitted[0].cue.source, SOURCES.AGGREGATED);
  adapter.stop();
});

test("adapter mantém frase quando a lacuna entre palavras supera a estabilidade atual", () => {
  const track = {
    kind: "captions",
    label: "Português (Brasil)",
    mode: "hidden",
    cues: [
      { text: "A", startTime: 0.2, endTime: 0.4, sequenceId: "0" },
      { text: "SIA", startTime: 1.1, endTime: 1.3, sequenceId: "1" },
      { text: "lê", startTime: 1.8, endTime: 2.0, sequenceId: "2" },
      { text: "legendas.", startTime: 2.5, endTime: 2.8, sequenceId: "3" },
    ],
    activeCues: [],
    addEventListener() {},
    removeEventListener() {},
  };
  const video = {
    id: "video-native-word-gap",
    currentTime: 0.3,
    currentSrc: "youtube-video-native-word-gap",
    duration: 6,
    paused: false,
    ended: false,
    textTracks: [track],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  let nowMs = 0;
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=nativewordgap" },
    windowRef,
    now: () => nowMs,
    emit: event => events.push(event),
  });
  adapter.start();
  for (const [currentTime, activeCues] of [
    [0.3, [track.cues[0]]],
    [0.8, []],
    [1.1, [track.cues[1]]],
    [1.8, [track.cues[2]]],
    [2.5, [track.cues[3]]],
  ]) {
    video.currentTime = currentTime;
    nowMs = Math.round(currentTime * 1000);
    track.activeCues = activeCues;
    adapter.scan();
  }
  const emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].cue.text, "A SIA lê legendas.");
  adapter.stop();
});

test("adapter não divide sentença longa em grupos pelo limite curto de retenção", () => {
  const words = ["Esta", "é", "uma", "frase", "longa", "com", "muitas", "palavras."];
  const track = {
    kind: "captions",
    label: "Português (Brasil)",
    mode: "hidden",
    cues: words.map((text, index) => ({
      text,
      startTime: 0.2 + index * 0.85,
      endTime: 0.45 + index * 0.85,
      sequenceId: String(index),
    })),
    activeCues: [],
    addEventListener() {},
    removeEventListener() {},
  };
  const video = {
    id: "video-native-long-fragment",
    currentTime: 0.25,
    currentSrc: "youtube-video-native-long-fragment",
    duration: 10,
    paused: false,
    ended: false,
    textTracks: [track],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  let nowMs = 0;
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=nativelongfragment" },
    windowRef,
    now: () => nowMs,
    emit: event => events.push(event),
  });
  adapter.start();
  for (const cue of track.cues) {
    video.currentTime = cue.startTime + 0.05;
    nowMs = Math.round(video.currentTime * 1000);
    track.activeCues = [cue];
    adapter.scan();
  }
  const emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].cue.text, "Esta é uma frase longa com muitas palavras.");
  adapter.stop();
});

test("adapter preserva frase nativa quando snapshot externo fragmentado já está carregado", () => {
  const listeners = new Map();
  const track = {
    kind: "captions",
    label: "Português (Brasil)",
    mode: "hidden",
    cues: [
      { text: "A", startTime: 0.2, endTime: 0.4, sequenceId: "0" },
      { text: "SIA", startTime: 0.8, endTime: 1.0, sequenceId: "1" },
      { text: "lê", startTime: 1.4, endTime: 1.6, sequenceId: "2" },
      { text: "legendas.", startTime: 2.0, endTime: 2.3, sequenceId: "3" },
    ],
    activeCues: [],
    addEventListener(name, listener) { listeners.set(`track:${name}`, listener); },
    removeEventListener() {},
  };
  const video = {
    id: "video-native-external-mixed",
    currentTime: 0.3,
    currentSrc: "youtube-video-native-external-mixed",
    duration: 6,
    paused: false,
    ended: false,
    textTracks: [track],
    addEventListener(name, listener) { listeners.set(`video:${name}`, listener); },
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=nativeexternalmixed" },
    windowRef,
    now: () => 1000,
    emit: event => events.push(event),
  });
  adapter.start();
  adapter.setExternalTimedCues({
    videoId: "nativeexternalmixed",
    trackKey: "ios-native-external-mixed",
    cues: track.cues,
  });
  for (const [currentTime, activeCues] of [
    [0.3, [track.cues[0]]],
    [0.55, []],
    [0.9, [track.cues[1]]],
    [1.5, [track.cues[2]]],
    [2.1, [track.cues[3]]],
  ]) {
    video.currentTime = currentTime;
    track.activeCues = activeCues;
    adapter.scan();
  }
  const emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].cue.text, "A SIA lê legendas.");
  assert.equal(emitted[0].cue.source, SOURCES.AGGREGATED);
  adapter.stop();
});

test("adapter usa cues futuras da TextTrack para emitir a sentença inteira de uma vez", () => {
  const track = {
    kind: "captions",
    label: "Português (Brasil)",
    mode: "hidden",
    cues: [
      { text: "Esta", startTime: 0.2, endTime: 0.45 },
      { text: "é", startTime: 0.8, endTime: 1.05 },
      { text: "uma", startTime: 1.4, endTime: 1.65 },
      { text: "frase", startTime: 2.0, endTime: 2.25 },
      { text: "longa.", startTime: 2.6, endTime: 2.95 },
    ],
    activeCues: [],
    addEventListener() {},
    removeEventListener() {},
  };
  const video = {
    id: "video-native-lookahead",
    currentTime: 0.25,
    currentSrc: "youtube-video-native-lookahead",
    duration: 8,
    paused: false,
    ended: false,
    textTracks: [track],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=nativelookahead" },
    windowRef,
    emit: event => events.push(event),
  });
  adapter.start();
  video.currentTime = 0.25;
  track.activeCues = [track.cues[0]];
  adapter.scan();
  video.currentTime = 0.9;
  track.activeCues = [track.cues[1]];
  adapter.scan();
  const emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].cue.text, "Esta é uma frase longa.");
  assert.equal(emitted[0].cue.startTime, 0.2);
  assert.equal(emitted[0].cue.endTime, 2.95);
  adapter.stop();
});

test("adapter mantém prosódia quando a continuação começa na linha visual seguinte", () => {
  const track = {
    kind: "captions",
    label: "Português (Brasil)",
    mode: "hidden",
    cues: [
      { text: "A última palavra", startTime: 0.2, endTime: 0.5, id: "" },
      { text: "da primeira linha", startTime: 0.9, endTime: 1.2, id: "" },
      { text: "continua", startTime: 1.6, endTime: 1.9, id: "" },
      { text: "na linha", startTime: 3.4, endTime: 3.7, id: "" },
      { text: "seguinte.", startTime: 4.0, endTime: 4.3, id: "" },
    ],
    activeCues: [],
    addEventListener() {},
    removeEventListener() {},
  };
  const video = {
    id: "video-native-line-break",
    currentTime: 0.25,
    currentSrc: "youtube-video-native-line-break",
    duration: 8,
    paused: false,
    ended: false,
    textTracks: [track],
    addEventListener() {},
    removeEventListener() {},
    closest() { return { id: "movie_player" }; },
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\\s)video(?:[.#:\\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; },
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    MutationObserver: undefined,
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=nativelinebreak" },
    windowRef,
    emit: event => events.push(event),
  });
  adapter.start();
  video.currentTime = 0.25;
  track.activeCues = [track.cues[0]];
  adapter.scan();
  video.currentTime = 3.45;
  track.activeCues = [track.cues[3]];
  adapter.scan();
  const emitted = events.filter(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].cue.text, "A última palavra da primeira linha continua na linha seguinte.");
  assert.equal(emitted[0].cue.endTime, 4.3);
  adapter.stop();
});

test("adapter encontra TextTrack e emite cue segura sem áudio próprio", () => {
  const listeners = new Map();
  const track = {
    kind: "captions",
    label: "Português (Brasil)",
    mode: "disabled",
    cues: [{ text: "Olá, curso.", startTime: 1, endTime: 3 }],
    activeCues: [{ text: "Olá, curso.", startTime: 1, endTime: 3 }],
    addEventListener(name, listener) { listeners.set(`track:${name}`, listener); },
    removeEventListener() {}
  };
  const video = {
    id: "video-1",
    currentTime: 1.5,
    currentSrc: "youtube-video",
    duration: 10,
    paused: false,
    ended: false,
    textTracks: [track],
    addEventListener(name, listener) { listeners.set(`video:${name}`, listener); },
    removeEventListener() {},
    closest() { return { id: "movie_player" }; }
  };
  const documentRef = {
    documentElement: {},
    querySelector(selector) { return /(^|\s)video(?:[.#:\s]|$)/.test(selector) ? video : null; },
    querySelectorAll(selector) { return selector === "video" ? [video] : []; }
  };
  const windowRef = {
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    MutationObserver: undefined
  };
  const events = [];
  const adapter = createYoutubeAdapter({
    documentRef,
    locationRef: { href: "https://www.youtube.com/watch?v=abc123" },
    windowRef,
    emit: event => events.push(event)
  });
  const diagnostic = adapter.start();
  assert.equal(track.mode, "disabled");
  assert.equal(diagnostic.state, STATES.PRIMARY_READY);
  assert.equal(diagnostic.source, SOURCES.TEXT_TRACK);
  assert.equal(events.some(event => event.type === "SIA_CAPTION_CHANGED" && event.cue?.safeToSpeak), true);
  assert.equal(events.some(event => event.type === "SIA_ADAPTER_ERROR"), false);
  adapter.stop();
});
