// service-worker.js
// Background service worker — proxy pro CORS-free download blobů
// ArrayBuffer → Base64 → content script → decode → Blob

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'FETCH_BLOBS') {
    handleFetchBlobs(msg.urls)
      .then(function(results) { sendResponse({ ok: true, results: results }); })
      .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
    return true;
  }
});

/**
 * @param {string[]} urls
 * @returns {Promise<Array<{url: string, path: string, base64: string}>>}
 */
async function handleFetchBlobs(urls) {
  var results = [];

  for (var i = 0; i < urls.length; i++) {
    var url = urls[i];
    var path = extractPath(url);

    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + path);

    var buffer = await res.arrayBuffer();

    // ArrayBuffer nemůže přes chrome.runtime.sendMessage → převedeme na Base64
    var base64 = arrayBufferToBase64(buffer);

    results.push({ url: url, path: path, base64: base64 });
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

function arrayBufferToBase64(buffer) {
  var bytes = new Uint8Array(buffer);
  var binary = '';
  for (var i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
