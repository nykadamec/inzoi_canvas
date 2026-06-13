// updaterUi.js
// UI pro updater — footer badge + manuální tlačítko "Check for updates"

var updaterFooterEl = null;
var updaterCheckBtnEl = null;
var updaterCheckInProgress = false;

function updaterGetCurrentVersion() {
  try {
    var manifest = (chrome && chrome.runtime && chrome.runtime.getManifest)
      ? chrome.runtime.getManifest() : {};
    return manifest.version || '0.0.0';
  } catch (e) {
    return '0.0.0';
  }
}

function updaterSetFooterText(footerEl, html) {
  if (!footerEl) return;
  footerEl.innerHTML = html;
}

/**
 * Renderuje footer podle výsledku kontroly.
 * @param {HTMLElement} footerEl
 * @param {{hasUpdate: boolean, currentVersion: string, latestVersion: string|null, downloadUrl: string|null, error: string|null}} info
 */
function updaterRenderFooter(footerEl, info) {
  if (!footerEl) return;
  var currentVersion = info.currentVersion || '0.0.0';

  if (info.error) {
    updaterSetFooterText(footerEl,
      '<span>v' + currentVersion + ' · update check failed</span> · ' +
      '<button id="inzoi-check-update-btn" ' +
        'style="background:none;border:none;color:#888;font-size:10px;cursor:pointer;padding:0 0 0 4px;text-decoration:underline;">' +
        'Check for updates' +
      '</button>'
    );
    wireCheckButton(footerEl);
    return;
  }

  if (info.hasUpdate && info.latestVersion) {
    var openUrl = info.downloadUrl || ('https://github.com/nykadamec/inzoi_canvas/releases/tag/v' + info.latestVersion);
    updaterSetFooterText(footerEl,
      '<span id="inzoi-update-badge" ' +
        'style="color:#60a5fa;cursor:pointer;font-weight:600;text-decoration:underline;" ' +
        'title="Click to open release page">' +
        '↻ Install v' + info.latestVersion +
      '</span> · ' +
      '<span style="color:#555;">current v' + currentVersion + '</span>'
    );
    var badge = document.getElementById('inzoi-update-badge');
    if (badge) {
      badge.addEventListener('click', function() {
        window.open(openUrl, '_blank');
      });
    }
    return;
  }

  updaterSetFooterText(footerEl,
    '<span>✓ v' + currentVersion + ' · up to date</span> · ' +
    '<button id="inzoi-check-update-btn" ' +
      'style="background:none;border:none;color:#888;font-size:10px;cursor:pointer;padding:0 0 0 4px;text-decoration:underline;">' +
      'Check for updates' +
    '</button>'
  );
  wireCheckButton(footerEl);
}

function wireCheckButton(footerEl) {
  var btn = document.getElementById('inzoi-check-update-btn');
  if (!btn) return;
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (updaterCheckInProgress) return;
    runUpdateCheck(footerEl, true);
  });
}

function runUpdateCheck(footerEl, force) {
  if (!footerEl) return;
  console.log('[InzoiUpdater:UI] runUpdateCheck force:', force);
  updaterCheckInProgress = true;
  updaterSetFooterText(footerEl,
    '<span style="color:#888;">⏳ Checking for updates…</span>'
  );

  var currentVersion = updaterGetCurrentVersion();

  var timeoutMs = 8000;
  var timeoutPromise = new Promise(function(_, rej) {
    setTimeout(function() { rej(new Error('Timeout after ' + timeoutMs + 'ms')); }, timeoutMs);
  });

  var workPromise = (async function() {
    if (!force) {
      var cache = await getCachedCheck();
      if (cache && cache.data && (Date.now() - cache.ts) < UPDATER_CACHE_TTL_MS) {
        console.log('[InzoiUpdater] cache hit, latest:', cache.data.latestVersion);
        return updaterBuildResult(currentVersion, cache.data);
      }
    }
    var release = await fetchLatestRelease();
    await setCachedCheck(release);
    return updaterBuildResult(currentVersion, release);
  })();

  Promise.race([workPromise, timeoutPromise])
    .then(function(info) {
      updaterCheckInProgress = false;
      updaterRenderFooter(footerEl, info);
    })
    .catch(function(err) {
      console.error('[InzoiUpdater] check failed:', err.message || err);
      updaterCheckInProgress = false;
      updaterRenderFooter(footerEl, updaterBuildErrorResult(currentVersion, err));
    });
}

/**
 * Inicializuje updater UI pro daný panel.
 * - Pasivní kontrola (lazy, z cache nebo 1 hit)
 * - Manuální tlačítko pro kontrolu
 * @param {HTMLElement} footerEl — #inzoi-version-footer element
 */
function initUpdaterUi(footerEl) {
  if (!footerEl) {
    console.warn('[InzoiUpdater:UI] footer element missing — skipping init');
    return;
  }
  console.log('[InzoiUpdater:UI] init start');
  updaterFooterEl = footerEl;
  runUpdateCheck(footerEl, false);
}
