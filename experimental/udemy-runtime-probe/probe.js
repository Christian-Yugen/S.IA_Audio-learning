(() => {
  'use strict';

  const MAX_EVENTS = 120;
  const MAX_MUTATIONS = 120;
  const startedAt = performance.now();
  const state = {
    probeVersion: '0.1.0',
    platformId: 'udemy',
    page: 'course-lecture',
    startedAtIso: new Date().toISOString(),
    lastScanMs: 0,
    scanCount: 0,
    videoIdentity: null,
    playerIdentity: null,
    video: null,
    tracks: [],
    captions: [],
    transcriptMarkers: [],
    events: [],
    mutations: 0,
    playerRebuilds: 0,
    errors: [],
    sourceConfidence: 'unknown',
  };

  let currentVideo = null;
  let videoObserver = null;
  let pageObserver = null;
  let scanTimer = null;
  let lastReportSignature = '';

  function relativeMs() {
    return Math.round(performance.now() - startedAt);
  }

  async function digest(value) {
    const text = String(value || '');
    if (!text) return '';
    try {
      const data = new TextEncoder().encode(text);
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      state.errors.push({ atMs: relativeMs(), kind: 'digest', name: error?.name || 'unknown' });
      return `length:${text.length}`;
    }
  }

  function pushLimited(list, value, limit) {
    list.push(value);
    if (list.length > limit) list.splice(0, list.length - limit);
  }

  function textMeta(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    return { length: value.length, words: value ? value.split(' ').length : 0 };
  }

  function selectorCount(selector) {
    try {
      return document.querySelectorAll(selector).length;
    } catch {
      return 0;
    }
  }

  function observeMediaEvents(video) {
    if (!video) return;
    const names = ['loadstart', 'loadedmetadata', 'durationchange', 'loadeddata', 'canplay', 'progress', 'timeupdate', 'play', 'pause', 'seeking', 'seeked', 'ratechange', 'ended', 'emptied', 'error'];
    for (const name of names) {
      video.addEventListener(name, () => {
        pushLimited(state.events, {
          name,
          atMs: relativeMs(),
          paused: Boolean(video.paused),
          currentTime: Number.isFinite(video.currentTime) ? Number(video.currentTime.toFixed(3)) : null,
          duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(3)) : null,
          playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : null,
        }, MAX_EVENTS);
        scheduleScan();
      }, { passive: true });
    }
  }

  function readTracks(video) {
    const output = [];
    try {
      for (let index = 0; index < video.textTracks.length; index += 1) {
        const track = video.textTracks[index];
        const cues = track.cues ? Array.from(track.cues) : [];
        const active = track.activeCues ? Array.from(track.activeCues) : [];
        output.push({
          index,
          kind: track.kind || '',
          label: track.label || '',
          language: track.language || '',
          mode: track.mode || '',
          readyState: typeof track.readyState === 'number' ? track.readyState : null,
          cueCount: cues.length,
          activeCueCount: active.length,
          activeCueMeta: active.slice(0, 3).map((cue) => ({
            startTime: Number.isFinite(cue.startTime) ? Number(cue.startTime.toFixed(3)) : null,
            endTime: Number.isFinite(cue.endTime) ? Number(cue.endTime.toFixed(3)) : null,
            ...textMeta(cue.text),
          })),
        });
      }
    } catch (error) {
      state.errors.push({ atMs: relativeMs(), kind: 'textTracks', name: error?.name || 'unknown' });
    }
    return output;
  }

  async function readCaptionMarkers() {
    const selectors = [
      '[data-purpose="caption"]',
      '[data-purpose="captions-dropdown-button"]',
      '[data-purpose="captions-dropdown-menu"]',
      '[class*="captions-display"]',
      '[class*="caption--captions"]',
    ];
    const markers = [];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 10);
      for (const node of nodes) {
        const meta = textMeta(node.textContent);
        markers.push({ selector, tag: node.tagName.toLowerCase(), length: meta.length, words: meta.words, textHash: await digest(node.textContent) });
      }
    }
    return markers;
  }

  async function readTranscriptMarkers() {
    const selectors = [
      '[data-purpose="transcript-toggle"]',
      '[aria-label*="Transcri"]',
      '[class*="transcript"]',
    ];
    const markers = [];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 10);
      for (const node of nodes) {
        const meta = textMeta(node.textContent);
        markers.push({ selector, tag: node.tagName.toLowerCase(), length: meta.length, words: meta.words, textHash: await digest(node.textContent) });
      }
    }
    return markers;
  }

  function findVideo() {
    return document.querySelector('video[data-purpose], video[id^="lecture-"], video');
  }

  function scanVideo(video) {
    if (video !== currentVideo) {
      if (currentVideo) state.playerRebuilds += 1;
      currentVideo = video || null;
      state.videoIdentity = video?.id || null;
      state.playerIdentity = video?.closest('[data-purpose="shaka-video-player"], [id^="shaka-video-container-"]')?.id || null;
      observeMediaEvents(video);
    }
    if (!video) {
      state.video = null;
      state.tracks = [];
      state.sourceConfidence = 'unknown';
      return;
    }
    state.video = {
      id: video.id || null,
      readyState: typeof video.readyState === 'number' ? video.readyState : null,
      networkState: typeof video.networkState === 'number' ? video.networkState : null,
      paused: Boolean(video.paused),
      currentTime: Number.isFinite(video.currentTime) ? Number(video.currentTime.toFixed(3)) : null,
      duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(3)) : null,
      playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : null,
      ended: Boolean(video.ended),
      textTrackCount: video.textTracks?.length || 0,
    };
    state.tracks = readTracks(video);
    state.sourceConfidence = state.tracks.some((track) => track.cueCount > 0 || track.activeCueCount > 0) ? 'high' : state.tracks.length ? 'medium' : 'unknown';
  }

  async function scan() {
    state.scanCount += 1;
    state.lastScanMs = relativeMs();
    const video = findVideo();
    scanVideo(video);
    state.captions = await readCaptionMarkers();
    state.transcriptMarkers = await readTranscriptMarkers();
    const signature = JSON.stringify({ video: state.video, tracks: state.tracks, captions: state.captions, transcript: state.transcriptMarkers, rebuilds: state.playerRebuilds });
    if (signature !== lastReportSignature) {
      lastReportSignature = signature;
      publish();
    }
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      void scan();
    }, 250);
  }

  function publish() {
    const report = {
      probeVersion: state.probeVersion,
      platformId: state.platformId,
      page: state.page,
      startedAtIso: state.startedAtIso,
      capturedAtMs: relativeMs(),
      scanCount: state.scanCount,
      videoIdentity: state.videoIdentity,
      playerIdentity: state.playerIdentity,
      video: state.video,
      tracks: state.tracks,
      captions: state.captions,
      transcriptMarkers: state.transcriptMarkers,
      eventCount: state.events.length,
      recentEvents: state.events.slice(-20),
      mutations: state.mutations,
      playerRebuilds: state.playerRebuilds,
      sourceConfidence: state.sourceConfidence,
      errors: state.errors.slice(-10),
    };
    chrome.runtime.sendMessage({ type: 'SIA_UDY_PROBE_REPORT', report }).catch(() => {});
    renderOverlay(report);
  }

  function renderOverlay(report) {
    let root = document.getElementById('sia-udy-probe-overlay');
    if (!root) {
      root = document.createElement('pre');
      root.id = 'sia-udy-probe-overlay';
      Object.assign(root.style, {
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: '2147483647',
        width: '360px',
        maxHeight: '260px',
        overflow: 'auto',
        margin: '0',
        padding: '10px',
        color: '#e8eef8',
        background: 'rgba(10, 18, 32, 0.94)',
        border: '1px solid #6ea8fe',
        borderRadius: '6px',
        font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
      });
      document.documentElement.appendChild(root);
    }
    root.textContent = JSON.stringify({
      probe: report.probeVersion,
      video: report.videoIdentity,
      player: report.playerIdentity,
      readyState: report.video?.readyState ?? null,
      paused: report.video?.paused ?? null,
      time: report.video?.currentTime ?? null,
      duration: report.video?.duration ?? null,
      rate: report.video?.playbackRate ?? null,
      tracks: report.tracks.map((track) => ({ language: track.language, kind: track.kind, mode: track.mode, cues: track.cueCount, active: track.activeCueCount })),
      captionMarkers: report.captions.length,
      transcriptMarkers: report.transcriptMarkers.length,
      events: report.eventCount,
      mutations: report.mutations,
      rebuilds: report.playerRebuilds,
      confidence: report.sourceConfidence,
    }, null, 2);
  }

  pageObserver = new MutationObserver((mutations) => {
    state.mutations += mutations.length;
    if (state.mutations > MAX_MUTATIONS) state.mutations = MAX_MUTATIONS;
    scheduleScan();
  });
  pageObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-current', 'data-purpose'] });

  window.setInterval(() => void scan(), 1000);
  window.addEventListener('pagehide', () => {
    pageObserver?.disconnect();
    videoObserver?.disconnect();
    const overlay = document.getElementById('sia-udy-probe-overlay');
    overlay?.remove();
  }, { once: true });

  void scan();
})();
