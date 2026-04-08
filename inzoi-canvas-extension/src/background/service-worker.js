// service-worker.js
// Background service worker — proxy pro CORS-free download blobů
// Komunikuje s content scriptem přes chrome.runtime.sendMessage

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'FETCH_BLOBS') {
    handleFetchBlobs(msg.urls)
      .then(function(results) { sendResponse({ ok: true, results: results }); })
      .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
    return true; // keep channel open for async response
  }
});

/**
 * Stáhne bloby přes background (CORS-free díky host_permissions)
 * @param {string[]} urls
 * @returns {Promise<Array<{url: string, path: string, data: ArrayBuffer}>>}
 */
async function handleFetchBlobs(urls) {
  var results = [];

  for (var i = 0; i < urls.length; i++) {
    var url = urls[i];
    var path = extractPath(url);

    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + path);

    var buffer = await res.arrayBuffer();
    results.push({ url: url, path: path, data: buffer });
  }

  return results;
}

function extractPath(url) {
  try {
    var cleanUrl = url.split('?')[0];
    var parts = cleanUrl.split('/');
    var ugcIndex = parts.indexOf('ugc');
    if (ugcIndex >= 0 && ugcIndex + 2 < parts.length) {
      return parts.slice(ugcIndex + 2).join('/');
    }
    return parts[parts.length - 1] || 'file.dat';
  } catch {
    return 'file.dat';
  }
}
