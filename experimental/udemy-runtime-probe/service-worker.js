const REPORT_KEY = 'sia_udy_probe_report';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SIA_UDY_PROBE_REPORT') {
    chrome.storage.session.set({ [REPORT_KEY]: message.report }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'SIA_UDY_GET_REPORT') {
    chrome.storage.session.get(REPORT_KEY).then((value) => sendResponse({ ok: true, report: value[REPORT_KEY] || null })).catch(() => sendResponse({ ok: false, report: null }));
    return true;
  }
  if (message?.type === 'SIA_UDY_CLEAR_REPORT') {
    chrome.storage.session.remove(REPORT_KEY).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});
