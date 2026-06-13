// updater.js
// Vlastní updater — kontrola verzí přes GitHub Releases API
// Načítá se přes importScripts() ze service-worker.js

var UPDATER_CACHE_KEY = 'inzoiLastUpdateCheck';
var UPDATER_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
var GITHUB_REPO = 'nykadamec/inzoi_canvas';
var UPDATER_GITHUB_API = 'https://api.github.com/repos/' + GITHUB_REPO + '/releases/latest';

function updaterCompareVersions(v1, v2) {
  var parts1 = String(v1 || '0.0.0').split('.').map(Number);
  var parts2 = String(v2 || '0.0.0').split('.').map(Number);
  for (var i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    var p1 = parts1[i] || 0;
    var p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

function updaterGetCachedCheck() {
  return new Promise(function(resolve) {
    try {
      chrome.storage.local.get([UPDATER_CACHE_KEY], function(r) {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(r[UPDATER_CACHE_KEY] || null);
      });
    } catch (e) { resolve(null); }
  });
}

function updaterSetCachedCheck(data) {
  return new Promise(function(resolve) {
    try {
      var obj = {};
      obj[UPDATER_CACHE_KEY] = { ts: Date.now(), data: data };
      chrome.storage.local.set(obj, function() { resolve(); });
    } catch (e) { resolve(); }
  });
}

async function updaterFetchLatestRelease() {
  console.log('[InzoiUpdater] fetching', UPDATER_GITHUB_API);
  var resp = await fetch(UPDATER_GITHUB_API, {
    headers: { 'Accept': 'application/vnd.github+json' },
  });
  console.log('[InzoiUpdater] response status:', resp.status);
  if (!resp.ok) throw new Error('GitHub API HTTP ' + resp.status);
  var json = await resp.json();
  var version = String(json.tag_name || '').replace(/^v/i, '') || null;
  var assetUrl = null;
  if (Array.isArray(json.assets)) {
    for (var i = 0; i < json.assets.length; i++) {
      var a = json.assets[i];
      if (a && a.name && /\.(zip|crx|xpi)$/i.test(a.name) && a.browser_download_url) {
        assetUrl = a.browser_download_url;
        break;
      }
    }
  }
  return {
    latestVersion: version,
    changelog: json.body || null,
    downloadUrl: json.html_url || null,
    assetUrl: assetUrl,
    publishedAt: json.published_at || null,
  };
}

function updaterBuildResult(currentVersion, release) {
  var hasUpdate = !!release.latestVersion && updaterCompareVersions(release.latestVersion, currentVersion) > 0;
  return {
    hasUpdate: hasUpdate,
    currentVersion: currentVersion,
    latestVersion: release.latestVersion,
    changelog: release.changelog,
    downloadUrl: release.downloadUrl,
    assetUrl: release.assetUrl,
    publishedAt: release.publishedAt,
    error: null,
  };
}

function updaterBuildErrorResult(currentVersion, err) {
  return {
    hasUpdate: false,
    currentVersion: currentVersion,
    latestVersion: null,
    changelog: null,
    downloadUrl: null,
    assetUrl: null,
    publishedAt: null,
    error: (err && err.message) ? err.message : String(err || 'unknown'),
  };
}

async function updaterHandleCheckUpdate(force) {
  var manifest = chrome.runtime.getManifest();
  var currentVersion = manifest.version || '0.0.0';
  console.log('[InzoiUpdater] check start — current:', currentVersion, 'force:', force);

  if (!force) {
    var cache = await updaterGetCachedCheck();
    if (cache && cache.data && (Date.now() - cache.ts) < UPDATER_CACHE_TTL_MS) {
      console.log('[InzoiUpdater] cache hit, latest:', cache.data.latestVersion);
      return updaterBuildResult(currentVersion, cache.data);
    }
  }

  try {
    var release = await updaterFetchLatestRelease();
    await updaterSetCachedCheck(release);
    return updaterBuildResult(currentVersion, release);
  } catch (e) {
    console.error('[InzoiUpdater] fetch failed:', e.message);
    return updaterBuildErrorResult(currentVersion, e);
  }
}

self.InzoiUpdater = {
  handleCheckUpdate: updaterHandleCheckUpdate,
  compareVersions: updaterCompareVersions,
};
