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

function loadParser() {
  const context = vm.createContext({ console });
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

test("agregador une microcues progressivas e elimina repetição", () => {
  const aggregator = createYoutubeCaptionAggregator({ now: () => 1000, stabilityMs: 400 });
  assert.deepEqual(aggregator.push({ text: "A S·IA", startTime: 1, endTime: 1.5, sequenceId: "1" }, 1000), []);
  const emitted = aggregator.push({ text: "A S·IA lê legendas.", startTime: 1.4, endTime: 2.2, sequenceId: "2" }, 1100);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].text, "A S·IA lê legendas.");
  assert.equal(emitted[0].source, SOURCES.AGGREGATED);
  assert.equal(emitted[0].safeToSpeak, true);
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
