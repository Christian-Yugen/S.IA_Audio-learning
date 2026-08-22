(() => {
  'use strict';

  const EVENT_NAME = 'SIA_SHAKA_CAPTION_CUE';
  const READY_EVENT = 'SIA_SHAKA_CAPTION_BRIDGE_READY';
  const SCAN_MS = 250;
  let timer = 0;
  let latestMessage = null;
  let lastKey = '';
  let observedVideo = null;
  let onTimeUpdate = null;

  function isObject(value) {
    return Boolean(value && (typeof value === 'object' || typeof value === 'function'));
  }

  function validCue(value) {
    return isObject(value)
      && String(value.text || '').trim().length > 0
      && Number.isFinite(Number(value.startTime))
      && Number.isFinite(Number(value.endTime))
      && Number(value.endTime) > Number(value.startTime);
  }

  function cueFromValue(value) {
    if (!isObject(value)) return null;
    try {
      if (validCue(value.activeCue)) return value.activeCue;
      const activeCues = value.activeCues;
      if (activeCues) {
        const cue = Array.from(activeCues).find(validCue);
        if (cue) return cue;
      }
    } catch {
      return null;
    }
    return null;
  }

  function findCue(video) {
    const container = video?.closest?.('[id^="shaka-video-container-"], [data-purpose="shaka-video-player"]');
    const root = container?.querySelector?.('[id$="-captions-display-container"]')
      || document.querySelector?.('[id$="-captions-display-container"]');
    if (!root) return null;

    const queue = [{ value: root, depth: 0 }];
    const visited = new Set();
    let inspected = 0;
    while (queue.length && inspected < 800) {
      const item = queue.shift();
      const value = item?.value;
      if (!isObject(value) || visited.has(value)) continue;
      visited.add(value);
      inspected += 1;

      const cue = cueFromValue(value);
      if (cue) return cue;
      if (item.depth >= 7) continue;

      let keys = [];
      try {
        keys = Object.keys(value);
      } catch {
        continue;
      }
      for (const key of keys) {
        if (
          key.startsWith('__reactFiber$')
          || key.startsWith('__reactInternalInstance$')
          || key === 'memoizedProps'
          || key === 'memoizedState'
          || key === 'child'
          || key === 'sibling'
          || key === 'return'
          || key === 'captionsStore'
          || key === 'captionDisplayStore'
          || key === 'activeCaption'
          || key === 'activeTrack'
        ) {
          try {
            queue.push({ value: value[key], depth: item.depth + 1 });
          } catch {
            // O player pode desmontar o store enquanto a árvore é percorrida.
          }
        }
      }
    }
    return null;
  }

  function identity(video) {
    const container = video?.closest?.('[id^="shaka-video-container-"], [data-purpose="shaka-video-player"]');
    return {
      videoId: typeof video?.id === 'string' ? video.id : '',
      containerId: typeof container?.id === 'string' ? container.id : '',
    };
  }

  function emitCue(video, cue) {
    const id = identity(video);
    const startTime = Number(cue.startTime);
    const endTime = Number(cue.endTime);
    const text = String(cue.text || '').replace(/\s+/g, ' ').trim();
    const key = JSON.stringify([id.videoId, id.containerId, text, startTime, endTime]);
    if (key === lastKey) return;
    lastKey = key;
    const message = {
      type: EVENT_NAME,
      cue: {
        platformId: 'udemy',
        adapterVersion: 'udemy-v0-experimental',
        source: 'shaka-caption',
        sourceConfidence: 'high',
        safeToSpeak: true,
        text,
        startTime,
        endTime,
        playerIdentity: id,
      },
    };
    latestMessage = message;
    window.postMessage(message, location.origin);
  }

  function scan() {
    const video = document.querySelector?.('video');
    if (!video) {
      lastKey = '';
      return;
    }
    if (video !== observedVideo) {
      if (observedVideo && onTimeUpdate) observedVideo.removeEventListener?.('timeupdate', onTimeUpdate);
      observedVideo = video;
      onTimeUpdate = scan;
      video.addEventListener?.('timeupdate', onTimeUpdate, { passive: true });
    }
    if (video.paused || video.ended) return;
    const cue = findCue(video);
    if (!cue) {
      lastKey = '';
      return;
    }
    const currentTime = Number(video.currentTime);
    if (!Number.isFinite(currentTime)) return;
    if (currentTime + 0.35 < Number(cue.startTime) || currentTime - 0.35 > Number(cue.endTime)) return;
    emitCue(video, cue);
  }

  function boot() {
    if (!/^www\.udemy\.com$/i.test(location.hostname)) return;
    timer = window.setInterval(scan, SCAN_MS);
    scan();
  }

  window.addEventListener('message', event => {
    if (event?.origin !== location.origin || event?.data?.type !== READY_EVENT) return;
    if (latestMessage) window.postMessage(latestMessage, location.origin);
  });

  window.addEventListener('pagehide', () => {
    window.clearInterval(timer);
    if (observedVideo && onTimeUpdate) observedVideo.removeEventListener?.('timeupdate', onTimeUpdate);
  }, { once: true });

  boot();
})();
