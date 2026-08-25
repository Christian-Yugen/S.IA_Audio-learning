(() => {
  'use strict';

  const SNAPSHOT_EVENT = 'SIA_YOUTUBE_TIMED_CUES';
  const STATUS_EVENT = 'SIA_YOUTUBE_TIMED_CUES_STATUS';
  const READY_EVENT = 'SIA_YOUTUBE_TIMED_CUES_READY';
  const TARGET_LANGUAGE = 'pt';
  const IOS_CLIENT_NAME = 'IOS';
  const IOS_CLIENT_VERSION = '20.10.4';
  let stopped = false;
  let scanTimer = null;
  let activeKey = '';
  let deliveredKey = '';
  let lastSnapshot = null;
  let fetchInFlight = false;
  let fetchKey = '';
  let clientTrack = null;
  let clientTrackPromise = null;
  let clientTrackVideoId = '';
  let fallbackRetryAt = 0;
  let timedtextRetryAt = 0;

  function post(type, payload = {}) {
    if (stopped || typeof window?.postMessage !== 'function') return;
    window.postMessage({ type, ...payload }, location.origin);
  }

  function configValue(key) {
    try {
      if (typeof window.ytcfg?.get === 'function') {
        const value = window.ytcfg.get(key);
        if (value !== undefined && value !== null && value !== '') return value;
      }
    } catch {
      // A configuração pode ser substituída durante uma navegação SPA.
    }
    try {
      const value = window.ytcfg?.data_?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    } catch {
      // Mantém o fallback de configuração ausente.
    }
    return null;
  }

  function extractVideoId() {
    try { return new URL(location.href).searchParams.get('v') || ''; } catch { return ''; }
  }

  function trackName(track) {
    const name = track?.name || {};
    if (typeof name.simpleText === 'string') return name.simpleText;
    if (Array.isArray(name.runs)) return name.runs.map(run => String(run?.text || '')).join('');
    return String(track?.trackName || '');
  }

  function responseTracks(response) {
    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return Array.isArray(tracks) ? tracks : [];
  }

  function normalizeInnertubeContext(value) {
    if (value && typeof value === 'object') return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  function preferredTrack(tracks, videoId, source) {
    const usable = tracks.filter(track => typeof track?.baseUrl === 'string' && track.baseUrl);
    if (!usable.length) return null;
    const preferred = usable.find(track => /^pt[-_]br$/i.test(String(track.languageCode || '')))
      || usable.find(track => /^pt(?:[-_]|$)/i.test(String(track.languageCode || '')))
      || usable[0];
    try {
      const url = new URL(preferred.baseUrl, location.origin);
      url.searchParams.set('fmt', 'json3');
      if (!/^pt(?:[-_]|$)/i.test(String(preferred.languageCode || ''))) {
        url.searchParams.set('tlang', TARGET_LANGUAGE);
      }
      return {
        videoId,
        languageCode: String(preferred.languageCode || ''),
        trackName: trackName(preferred),
        trackKey: String(preferred.vssId || preferred.baseUrl || ''),
        source,
        url: url.toString(),
      };
    } catch {
      return null;
    }
  }

  function responseCandidates() {
    const candidates = [];
    if (window.ytInitialPlayerResponse && typeof window.ytInitialPlayerResponse === 'object') {
      candidates.push(window.ytInitialPlayerResponse);
    }
    if (window.ytplayer?.bootstrapPlayerResponse && typeof window.ytplayer.bootstrapPlayerResponse === 'object') {
      candidates.push(window.ytplayer.bootstrapPlayerResponse);
    }
    try {
      const playerResponse = window.ytplayer?.config?.args?.player_response;
      if (typeof playerResponse === 'string') candidates.push(JSON.parse(playerResponse));
      else if (playerResponse && typeof playerResponse === 'object') candidates.push(playerResponse);
    } catch {
      // YouTube pode substituir a configuração durante a navegação SPA.
    }
    return candidates;
  }

  function findWebCaptionTrack() {
    const videoId = extractVideoId();
    for (const response of responseCandidates()) {
      const track = preferredTrack(responseTracks(response), videoId, 'youtube-web');
      if (track) return track;
    }
    return null;
  }

  function findCaptionTrack() {
    const videoId = extractVideoId();
    if (clientTrack && clientTrackVideoId === videoId) return clientTrack;
    return findWebCaptionTrack();
  }

  async function fetchInnertubeCaptionTrack(videoId) {
    const apiKey = String(configValue('INNERTUBE_API_KEY') || '').trim();
    if (!apiKey) throw new Error('innertube-api-key-unavailable');
    const context = normalizeInnertubeContext(configValue('INNERTUBE_CONTEXT'));
    const clientContext = context.client || {};
    const endpoint = new URL('/youtubei/v1/player', location.origin);
    endpoint.searchParams.set('key', apiKey);
    endpoint.searchParams.set('prettyPrint', 'false');
    const response = await fetch(endpoint.toString(), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: IOS_CLIENT_NAME,
            clientVersion: IOS_CLIENT_VERSION,
            hl: String(clientContext.hl || configValue('HL') || 'pt'),
            gl: String(clientContext.gl || configValue('GL') || 'BR'),
            ...(clientContext.visitorData ? { visitorData: String(clientContext.visitorData) } : {}),
          },
        },
        videoId,
      }),
    });
    if (!response.ok) throw new Error(`innertube-player-http-${response.status}`);
    const payload = JSON.parse(await response.text());
    const track = preferredTrack(responseTracks(payload), videoId, 'youtube-innertube-ios');
    if (!track) throw new Error('innertube-caption-track-unavailable');
    return track;
  }

  async function warmClientCaptionTrack(videoId) {
    if (!videoId) return null;
    if (Date.now() < fallbackRetryAt) return null;
    if (clientTrack && clientTrackVideoId === videoId) return clientTrack;
    if (clientTrackPromise && clientTrackVideoId === videoId) return clientTrackPromise;
    clientTrackVideoId = videoId;
    post(STATUS_EVENT, { videoId, state: 'FALLBACK_FETCHING', client: IOS_CLIENT_NAME });
    clientTrackPromise = fetchInnertubeCaptionTrack(videoId)
      .then(track => {
        if (stopped || extractVideoId() !== videoId) return null;
        clientTrack = track;
        clientTrackVideoId = videoId;
        fallbackRetryAt = 0;
        post(STATUS_EVENT, {
          videoId,
          state: 'FALLBACK_READY',
          client: IOS_CLIENT_NAME,
          languageCode: track.languageCode,
        });
        scan();
        return track;
      })
      .catch(error => {
        const reason = error?.message || String(error);
        fallbackRetryAt = Date.now() + (reason.includes('429') ? 30000 : 8000);
        post(STATUS_EVENT, {
          videoId,
          state: 'ERROR',
          client: IOS_CLIENT_NAME,
          source: 'youtube-innertube-ios',
          reason,
        });
        return null;
      })
      .finally(() => {
        clientTrackPromise = null;
      });
    return clientTrackPromise;
  }

  async function fetchCues(track) {
    if (fetchInFlight || !track?.url || !globalThis.SiaYoutubeCaptionParser) return;
    if (track.source === 'youtube-innertube-ios' && Date.now() < timedtextRetryAt) return;
    fetchInFlight = true;
    const requestKey = `${track.source}|${track.videoId}|${track.url}`;
    fetchKey = requestKey;
    post(STATUS_EVENT, {
      videoId: track.videoId,
      state: 'FETCHING',
      languageCode: track.languageCode,
      source: track.source,
    });
    try {
      const response = await fetch(track.url, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(`timedtext-http-${response.status}`);
      const cues = globalThis.SiaYoutubeCaptionParser.parse(await response.text());
      if (!Array.isArray(cues) || !cues.length) throw new Error('timedtext-empty');
      if (activeKey !== requestKey || extractVideoId() !== track.videoId) return;
      deliveredKey = requestKey;
      timedtextRetryAt = 0;
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
      post(STATUS_EVENT, {
        videoId: track.videoId,
        state: 'READY',
        languageCode: track.languageCode,
        cueCount: cues.length,
        source: track.source,
      });
    } catch (error) {
      const reason = error?.message || String(error);
      if (track.source === 'youtube-innertube-ios') {
        timedtextRetryAt = Date.now() + (reason.includes('429') ? 30000 : 8000);
      }
      post(STATUS_EVENT, {
        videoId: track.videoId,
        state: 'ERROR',
        languageCode: track.languageCode,
        source: track.source,
        reason,
      });
      if (track.source !== 'youtube-innertube-ios') {
        void warmClientCaptionTrack(track.videoId);
      }
    } finally {
      if (fetchKey === requestKey) {
        fetchInFlight = false;
        fetchKey = '';
      }
    }
  }

  function scan() {
    if (stopped) return;
    const videoId = extractVideoId();
    if (clientTrack && clientTrackVideoId !== videoId) {
      clientTrack = null;
      clientTrackPromise = null;
    }
    const track = findCaptionTrack();
    if (!track) {
      post(STATUS_EVENT, { videoId, state: 'UNAVAILABLE' });
      if (!clientTrackPromise) void warmClientCaptionTrack(videoId);
      return;
    }
    const key = `${track.source}|${track.videoId}|${track.url}`;
    if (key !== activeKey) {
      activeKey = key;
      deliveredKey = '';
      timedtextRetryAt = 0;
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
