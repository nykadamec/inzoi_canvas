// proxy.js
// Wrapper pro chrome.runtime.sendMessage — Promise-based
// Používá se v content scriptech, kde není přímý přístup k service workeru.
// Sjednocuje response formát na { ok, result } (single source of truth).

/**
 * @param {object} msg
 * @returns {Promise<any>}
 */
function proxySend(msg) {
  return new Promise(function(res, rej) {
    try {
      chrome.runtime.sendMessage(msg, function(resp) {
        if (chrome.runtime.lastError) {
          rej(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!resp) {
          rej(new Error('No response from service worker'));
          return;
        }
        if (!resp.ok) {
          rej(new Error(resp.error || 'Proxy error'));
          return;
        }
        res(resp.result);
      });
    } catch (e) {
      rej(e);
    }
  });
}
