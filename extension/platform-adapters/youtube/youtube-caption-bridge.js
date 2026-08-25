(() => {
  'use strict';

  const SNAPSHOT_EVENT = 'SIA_YOUTUBE_TIMED_CUES';
  const STATUS_EVENT = 'SIA_YOUTUBE_TIMED_CUES_STATUS';
  const READY_EVENT = 'SIA_YOUTUBE_TIMED_CUES_READY';
  const TARGET_LANGUAGE = 'pt';
  let stopped = false;
  let scanTimer = null;
  let activeKey = '';
  let deliveredKey = '';
  let lastSnapshot = null;
  let fetchInFlight = false;
  let fetchKey = '';

  function extractVideoId() {
    try { return new URL(location.href).searchParams.get('v') || ''; } catch { return ''; }
  }

  function post(type, payload = {}) {
    if (stopped || typeof window?.postMessage !== 'function') return;
    window.postMessage({ type, ...payload }, location.origin);
  }

  function responseCandidates() {
    const candidates = [];
    if (window.ytInitialPlayerResponse && typeof window.ytInitialPlayerResponse === 'object') candidates.push(window.ytInitialPlayerResponse);
    if (window.ytplayer?.bootstrapPlayerResponse && typeof window.ytplayer.bootstrapPlayerResponse === 'object') candidates.push(window.ytplayer.bootstrapPlayerResponse);
    try {
      const playerResponse = window.ytplayer?.config?.args?.player_response;
      if (typeof playerResponse === 'string') candidates.push(JSON.parse(playerResponse));
      else if (playerResponse && typeof playerResponse === 'object') candidates.push(playerResponse);
    } catch {
      // YouTube pode substituir a configuração durante a navegação SPA.
    }
    return candidates;
  }

  function findCaptionTrack() {
    const videoId = extractVideoId();
    for (const response of responseCandidates()) {
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!Array.isArray(tracks) || !tracks.length) continue;
      const usable = tracks.filter(track => typeof track?.baseUrl === 'string' && track.baseUrl);
      if (!usable.length) continue;
      const preferred = usable.find(track => /^pt[-_]br$/i.test(String(track.languageCode || '')))
        || usable.find(track => /^pt(?:[-_]|$)/i.test(String(track.languageCode || '')))
        || usable[0];
      try {
        const url = new URL(preferred.baseUrl, location.origin);
        url.searchParams.set('fmt', 'json3');
        if (!/^pt(?:[-_]|$)/i.test(String(preferred.languageCode || ''))) url.searchParams.set('tlang', TARGET_LANGUAGE);
        return {
          videoId,
          languageCode: String(preferred.languageCode || ''),
          trackName: String(preferred.name?.simpleText || ''),
          url: url.toString(),
        };
      } catch {
        // Ignora uma track malformada e tenta a próxima resposta do player.
      }
    }
    return null;
  }

  async function fetchCues(track) {
    if (fetchInFlight || !track?.url || !globalThis.SiaYoutubeCaptionParser) return;
    fetchInFlight = true;
    const requestKey = `${track.videoId}|${track.url}`;
    fetchKey = requestKey;
    post(STATUS_EVENT, { videoId: track.videoId, state: 'FETCHING', languageCode: track.languageCode });
    try {
      const response = await fetch(track.url, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(`timedtext-http-${response.status}`);
      const cues = globalThis.SiaYoutubeCaptionParser.parse(await response.text());
      if (!Array.isArray(cues) || !cues.length) throw new Error('timedtext-empty');
      if (activeKey !== requestKey || extractVideoId() !== track.videoId) return;
      deliveredKey = requestKey;
      lastSnapshot = {
        type: SNAPSHOT_EVENT,
        videoId: track.videoId,
        trackKey: activeKey,
        languageCode: track.languageCode,
        source: 'youtube-timedtext',
        sourceConfidence: 'high',
        cues,
      };
      post(SNAPSHOT_EVENT, lastSnapshot);
      post(STATUS_EVENT, { videoId: track.videoId, state: 'READY', languageCode: track.languageCode, cueCount: cues.length });
    } catch (error) {
      post(STATUS_EVENT, {
        videoId: track.videoId,
        state: 'ERROR',
        languageCode: track.languageCode,
        reason: error?.message || String(error),
      });
    } finally {
      if (fetchKey === requestKey) {
        fetchInFlight = false;
        fetchKey = '';
      }
    }
  }

  function scan() {
    if (stopped) return;
    const track = findCaptionTrack();
    if (!track) {
      post(STATUS_EVENT, { videoId: extractVideoId(), state: 'UNAVAILABLE' });
      return;
    }
    const key = `${track.videoId}|${track.url}`;
    if (key !== activeKey) {
      activeKey = key;
      deliveredKey = '';
      void fetchCues(track);
    } else if (deliveredKey !== key && !fetchInFlight) {
      void fetchCues(track);
    }
  }

  window.addEventListener('message', event => {
    if (event?.data?.type !== READY_EVENT || event.origin !== location.origin) return;
    if (lastSnapshot) post(SNAPSHOT_EVENT, lastSnapshot);
    scan();
  });
  scan();
  scanTimer = window.setInterval(scan, 1200);
  window.addEventListener('pagehide', () => {
    stopped = true;
    if (scanTimer !== null) window.clearInterval(scanTimer);
    scanTimer = null;
  }, { once: true });
})();
