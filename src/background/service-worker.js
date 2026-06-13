// service-worker.js
// Background service worker — CORS-free proxy for downloading blobs + mod info
// ArrayBuffer → Base64 → content script → decode → Blob

var CF_API_KEY = '$2a$10$dcQ6ahjTz05GGWgZbr7zeuCRycH/0yj1O5SIlLDlHVzGSXXJIM70C';
var CF_BASE_URL = 'https://api.curseforge.com/v1';
var CF_GAME_ID = '88849'; // inZOI game ID on CurseForge
var CF_RATE_LIMIT_MS = 200;

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'FETCH_BLOBS') {
    handleFetchBlobs(msg.urls)
      .then(function(results) { sendResponse({ ok: true, result: results }); })
      .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
    return true;
  }

  if (msg.type === 'FETCH_MOD_INFO') {
    handleFetchModInfo(msg.mods)
      .then(function(results) { sendResponse({ ok: true, result: results }); })
      .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
    return true;
  }

  if (msg.type === 'SAVE_ZIP') {
    handleSaveZip(msg.data, msg.filename, msg.saveAs)
      .then(function(downloadId) { sendResponse({ ok: true, result: downloadId }); })
      .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
    return true;
  }

  if (msg.type === 'DOWNLOAD_ASSET') {
    handleDownloadAsset(msg.url, msg.filename, msg.saveAs)
      .then(function(downloadId) { sendResponse({ ok: true, result: downloadId }); })
      .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
    return true;
  }
});

// ─── Blob Fetching ────────────────────────────────────────────────────────────

async function handleFetchBlobs(urls) {
  var results = [];
  for (var i = 0; i < urls.length; i++) {
    var url = urls[i];
    var path = extractPath(url);
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + path);
    var buffer = await res.arrayBuffer();
    var base64 = arrayBufferToBase64(buffer);
    results.push({ url: url, path: path, base64: base64 });
  }
  return results;
}

// ─── CurseForge Mod Info ─────────────────────────────────────────────────────

async function handleFetchModInfo(mods) {
  var results = [];
  for (var i = 0; i < mods.length; i++) {
    var mod = mods[i];
    var result = await fetchModDetails(mod.ugc_id, mod.author);
    results.push(result);
    if (i < mods.length - 1) await sleep(CF_RATE_LIMIT_MS);
  }
  return results;
}

/**
 * Fetches mod detail from CurseForge API
 * gameId=88849 is inZOI on CurseForge
 * @param {number} ugcId
 * @param {string} author
 * @returns {Promise}
 */
async function fetchModDetails(ugcId, author) {
  var baseResult = {
    ugc_id: ugcId,
    author: author,
    name: null,
    summary: null,
    modPageUrl: 'https://www.curseforge.com/inzoi/createzoi/' + ugcId,
    slug: null,
    status: 'error',
  };

  try {
    // Info o modu — NUTNÝ parametr: gameId=88849
    var modRes = await fetch(CF_BASE_URL + '/mods/' + ugcId + '?gameId=' + CF_GAME_ID, {
      headers: { 'Accept': 'application/json', 'x-api-key': CF_API_KEY },
    });

    if (modRes.status === 404) {
      baseResult.status = 'not_found';
      return baseResult;
    }
    if (modRes.status === 403) {
      baseResult.status = 'forbidden';
      return baseResult;
    }
    if (modRes.status !== 200) {
      baseResult.status = 'error';
      return baseResult;
    }

    var modData = await modRes.json();
    baseResult.name = (modData.data && modData.data.name) || null;
    baseResult.summary = (modData.data && modData.data.summary) || null;
    baseResult.slug = (modData.data && modData.data.slug) || null;

    // Odkaz na mod page — /inzoi/createzoi/[slug]
    if (modData.data && modData.data.links && modData.data.links.websiteUrl) {
      baseResult.modPageUrl = modData.data.links.websiteUrl;
    }

    baseResult.status = 'ok';
    return baseResult;

  } catch (e) {
    baseResult.status = 'error';
    return baseResult;
  }
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ─── ZIP Save via chrome.downloads ───────────────────────────────────────────

/**
 * Sanitizes a filename to prevent path traversal and invalid characters.
 * Only allows safe filename characters, replaces path separators with dashes.
 */
function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'canvas_download';
  var sanitized = name.replace(/\.\./g, '').replace(/[\/\\]/g, '-');
  sanitized = sanitized.replace(/[\x00-\x1f\x7f<>"|?*:]/g, '');
  sanitized = sanitized.replace(/^[\s.\-]+|[\s.\-]+$/g, '');
  return sanitized || 'canvas_download';
}

async function handleSaveZip(base64Data, filename, saveAs) {
  var safeName = sanitizeFilename(filename);
  var dataUrl = 'data:application/zip;base64,' + base64Data;

  return new Promise(function(resolve, reject) {
    chrome.downloads.download({
      url: dataUrl,
      filename: safeName,
      saveAs: !!saveAs,
      conflictAction: 'uniquify',
    }, function(downloadId) {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(downloadId);
    });
  });
}

async function handleDownloadAsset(url, filename, saveAs) {
  var safeName = sanitizeFilename(filename);
  return new Promise(function(resolve, reject) {
    chrome.downloads.download({
      url: url,
      filename: safeName,
      saveAs: saveAs !== false,
      conflictAction: 'uniquify',
    }, function(downloadId) {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(downloadId);
    });
  });
}



// ─── Helpers ────────────────────────────────────────────────────────────────

function extractPath(url) {
  try {
    var cleanUrl = url.split('?')[0];
    var parts = cleanUrl.split('/');
    var ugcIndex = parts.indexOf('ugc');
    if (ugcIndex >= 0 && ugcIndex + 2 < parts.length) {
      return parts.slice(ugcIndex + 2).join('/');
    }
    return parts[parts.length - 1] || 'file.dat';
  } catch (e) {
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
