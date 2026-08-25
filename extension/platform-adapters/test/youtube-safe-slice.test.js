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
  now = 3000;
  adapter.scan();
  const emitted = events.find(event => event.type === "SIA_CAPTION_CHANGED");
  assert.equal(Boolean(emitted), true);
  assert.equal(emitted.cue.source, SOURCES.AGGREGATED);
  assert.equal(emitted.cue.sourceConfidence, CONFIDENCE.HIGH);
  assert.equal(emitted.cue.safeToSpeak, true);
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
  assert.equal(diagnostic.state, STATES.PRIMARY_READY);
  assert.equal(diagnostic.source, SOURCES.TEXT_TRACK);
  assert.equal(events.some(event => event.type === "SIA_CAPTION_CHANGED" && event.cue?.safeToSpeak), true);
  assert.equal(events.some(event => event.type === "SIA_ADAPTER_ERROR"), false);
  adapter.stop();
});
