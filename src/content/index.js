// index.js — Chrome Extension entry point
// Orchestruje všechny moduly, wiring FAB + panel + download flow + mods UI

(function () {
  'use strict';
  console.log('[InzoiCanvas] Extension loaded');

  // ─── UI event guard ───────────────────────────────────────────────────────
  function installUiEventGuard() {
    function isInsideOurUi(target) {
      return target && target instanceof Element && !!target.closest('#inzoi-fab, #inzoi-dl-panel');
    }
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach(function(type) {
      window.addEventListener(type, function(e) {
        if (isInsideOurUi(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        }
      }, true);
      document.addEventListener(type, function(e) {
        if (isInsideOurUi(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        }
      }, true);
    });
  }

  // ─── Save helpers ──────────────────────────────────────────────────────────

  /**
   * Uloží ZIP přes chrome.downloads v background scriptu.
   * @param {Blob} zipBlob
   * @param {string} zipFileName — filename pro ZIP
   * @param {boolean} saveAs — true = "Save As" dialog, false = rovnou do default složky
   * @returns {Promise<number>} downloadId
   */
  async function saveZipViaBackground(zipBlob, zipFileName, saveAs) {
    return new Promise(function(res, rej) {
      var reader = new FileReader();
      reader.onload = function() {
        var base64 = reader.result.split(',')[1];
        proxySend({ type: 'SAVE_ZIP', data: base64, filename: zipFileName, saveAs: saveAs })
          .then(function(downloadId) { res(downloadId); })
          .catch(function(err) { rej(err); });
      };
      reader.onerror = function() { rej(new Error('Failed to read ZIP blob')); };
      reader.readAsDataURL(zipBlob);
    });
  }

  // ─── Proxy helpers ──────────────────────────────────────────────────────────
  async function fetchBlobsViaProxy(urls) {
    return proxySend({ type: 'FETCH_BLOBS', urls: urls });
  }

  async function fetchModsInfo(mods) {
    return proxySend({ type: 'FETCH_MOD_INFO', mods: mods });
  }

  function base64ToArrayBuffer(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  /**
 * Scrapes the canvas name from the page.
 * Looks for: <p class="break-words text-[2.5rem] font-bold">...</p>
 * @returns {string|null}
 */
function scrapeCanvasName() {
  try {
    // Try the known class pattern first
    var els = document.querySelectorAll('p.break-words.text-\\[2\\.5rem\\].font-bold');
    if (els && els.length > 0) {
      return els[0].textContent.trim() || null;
    }
    // Fallback: any p with text-[2.5rem]
    var allP = document.querySelectorAll('p');
    for (var i = 0; i < allP.length; i++) {
      var style = window.getComputedStyle(allP[i]);
      if (style.fontSize === '2.5rem' && allP[i].textContent.trim()) {
        return allP[i].textContent.trim();
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Scrapes required mods directly from the page DOM.
 * Looks for the "Mod Info" section on the creation page.
 * @returns {Array<{name: string, author: string, modPageUrl: string}|null}
 */
function scrapeModsFromPage() {
  try {
    // Find the Mod Info container
    var allDivs = document.querySelectorAll('div');
    var modInfoContainer = null;
    for (var i = 0; i < allDivs.length; i++) {
      var el = allDivs[i];
      var children = el.querySelectorAll('*');
      var hasModInfo = false;
      var hasIncludes = false;
      for (var j = 0; j < children.length; j++) {
        if (children[j].textContent && children[j].textContent.includes('Mod Info')) hasModInfo = true;
        if (children[j].textContent && children[j].textContent.includes('Includes')) hasIncludes = true;
      }
      if (hasModInfo && hasIncludes) {
        modInfoContainer = el;
        break;
      }
    }
    if (!modInfoContainer) return null;

    var mods = [];
    // Find all mod entries — they have an img + bold text + author button
    var modEntries = modInfoContainer.querySelectorAll('div.group');
    for (var k = 0; k < modEntries.length; k++) {
      var entry = modEntries[k];
      var nameEl = entry.querySelector('p.text-xs.font-bold');
      var authorEl = entry.querySelector('button.author-btn');
      if (nameEl) {
        var name = nameEl.textContent.trim();
        var author = authorEl ? authorEl.textContent.trim() : '—';
        // Build CurseForge URL from mod name
        var slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        var modPageUrl = 'https://www.curseforge.com/inzoi/createzoi/' + slug;
        mods.push({ name: name, author: author, modPageUrl: modPageUrl, status: 'ok' });
      }
    }
    return mods.length > 0 ? mods : null;
  } catch (e) { return null; }
}

/**
 * Update canvas name in panel — called after panel opens
 */
function updateCanvasNameInPanel() {
  var el = document.getElementById('inzoi-canvas-name');
  if (!el) return;
  var name = scrapeCanvasName();
  if (name) {
    el.textContent = name;
  } else {
    el.textContent = '—';
    el.style.color = '#666';
  }
}

/**
 * Update mods section in panel from scraped page data — auto-expands
 */
function updateModsInPanelFromPage() {
  var section = document.getElementById('inzoi-mods-section');
  var body = document.getElementById('inzoi-mods-body');
  var countEl = document.getElementById('inzoi-mods-count');
  var arrowEl = document.getElementById('inzoi-mods-arrow');
  if (!section || !body) return;

  var mods = scrapeModsFromPage();

  if (!mods || mods.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  modsCache._rawModInfo = mods.map(function(m) { return { ugc_id: null, author: m.author }; });

  var rows = mods.map(function(m, i) {
    var short = m.name.length > 26 ? m.name.substring(0, 24) + '…' : m.name;
    var dlUrl = m.modPageUrl || '#';
    return '<tr style="border-bottom:1px solid rgba(255,255,255,.05);">' +
      '<td style="padding:6px 8px;color:#888;font-size:11px;">' + (i+1) + '</td>' +
      '<td style="padding:6px 8px;font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + m.name + '">' + short + '</td>' +
      '<td style="padding:6px 8px;color:#888;font-size:11px;">' + (m.author || '—') + '</td>' +
      '<td style="padding:6px 8px;text-align:center;"><a href="' + dlUrl + '" target="_blank" style="color:#60a5fa;font-size:12px;text-decoration:none;" title="Open on CurseForge">🌐</a></td></tr>';
  }).join('');

  body.innerHTML = '<table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:8px;">' +
    '<tr style="color:#888;border-bottom:1px solid rgba(255,255,255,.1);">' +
    '<th style="padding:4px 8px;text-align:left;font-size:11px;">#</th>' +
    '<th style="padding:4px 8px;text-align:left;font-size:11px;">Name</th>' +
    '<th style="padding:4px 8px;text-align:left;font-size:11px;">Author</th>' +
    '<th style="padding:4px 8px;text-align:center;font-size:11px;">Status</th>' +
    '</tr>' + rows + '</table>';
}

// ─── Mods state ───────────────────────────────────────────────────────────
  var modsCache = { _rawModInfo: null };

  function setModsCache(cid, data) { modsCache[cid] = data; }
  function getModsCache(cid) { return modsCache[cid] || null; }

  function renderModsTable(modsData) {
    var body = document.getElementById('inzoi-mods-body');
    if (!body || !modsData || !modsData.length) return;
    var rows = modsData.map(function(m, i) {
      var name = (m.name || m.summary || 'N/A');
      var short = name.length > 26 ? name.substring(0, 24) + '…' : name;

      var statusCell;
      var dlUrl = m.modPageUrl || 'https://www.curseforge.com/inzoi/createzoi/' + m.ugc_id;
      if (m.status === 'ok') {
        statusCell = '<a href="' + dlUrl + '" target="_blank" style="color:#60a5fa;font-size:12px;text-decoration:none;" title="Open on CurseForge">🌐</a>';
      } else if (m.status === 'not_found') {
        statusCell = '<span style="color:#888;font-size:11px;" title="Not found on CurseForge">—</span>';
      } else if (m.status === 'forbidden') {
        statusCell = '<span style="color:#f0a500;font-size:11px;" title="API access denied">⚠️</span>';
      } else {
        statusCell = '<span style="color:#ff4444;font-size:12px;cursor:pointer;" title="' + (m.status || 'unavailable') + '">❌</span>';
      }

      return '<tr style="border-bottom:1px solid rgba(255,255,255,.05);">' +
        '<td style="padding:6px 8px;color:#888;font-size:11px;">' + (i+1) + '</td>' +
        '<td style="padding:6px 8px;font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + name + '">' + short + '</td>' +
        '<td style="padding:6px 8px;color:#888;font-size:11px;">' + (m.author || '—') + '</td>' +
        '<td style="padding:6px 8px;text-align:center;">' + statusCell + '</td></tr>';
    }).join('');

    body.innerHTML = '<table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:8px;">' +
      '<tr style="color:#888;border-bottom:1px solid rgba(255,255,255,.1);">' +
        '<th style="padding:4px 8px;text-align:left;font-size:11px;">#</th>' +
        '<th style="padding:4px 8px;text-align:left;font-size:11px;">Name</th>' +
        '<th style="padding:4px 8px;text-align:left;font-size:11px;">Author</th>' +
        '<th style="padding:4px 8px;text-align:center;font-size:11px;">Status</th>' +
      '</tr>' + rows + '</table>';
  }

  async function handleModsExpand(canvasId) {
    var body = document.getElementById('inzoi-mods-body');
    if (!body) return;

    // If we already have page-scraped data (from openPanel), use it directly — skip API
    if (modsCache._rawModInfo && modsCache._rawModInfo.length > 0 && modsCache._rawModInfo[0].ugc_id === null) {
      // Page-scraped data — already rendered by updateModsInPanelFromPage(), just show it
      return;
    }

    var cached = getModsCache(canvasId);
    if (cached) { renderModsTable(cached); return; }
    body.innerHTML = '<div style="padding:12px;text-align:center;color:#888;font-size:12px;">⏳ Loading mod info...</div>';
    try {
      var results = await fetchModsInfo(modsCache._rawModInfo || []);
      setModsCache(canvasId, results);
      renderModsTable(results);
    } catch (e) {
      body.innerHTML = '<div style="padding:12px;color:#ff4444;font-size:12px;">❌ Failed: ' + (e.message || 'unknown') + '</div>';
    }
  }

  // ─── Inject mods section into existing panel ──────────────────────────────
  function injectModsSection(modInfo, canvasId) {
    if (!modInfo || !modInfo.length) return;
    if (document.getElementById('inzoi-mods-section')) return; // already injected
    var container = document.getElementById('inzoi-progress-container');
    if (!container) return;

    modsCache._rawModInfo = modInfo;

    var section = document.createElement('div');
    section.id = 'inzoi-mods-section';
    section.style.cssText = 'margin-top:12px;';
    section.innerHTML =
      '<div id="inzoi-mods-header" style="padding:12px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:12px;font-weight:600;">🎯 Required mods (' + modInfo.length + ')</span>' +
        '<span id="inzoi-mods-arrow" style="color:#888;font-size:12px;">▶</span>' +
      '</div>' +
      '<div id="inzoi-mods-body" style="display:none;"></div>';

    container.parentNode.insertBefore(section, container.nextSibling);

    document.getElementById('inzoi-mods-header').onclick = function() {
      var body = document.getElementById('inzoi-mods-body');
      var arrow = document.getElementById('inzoi-mods-arrow');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        arrow.textContent = '▼';
        handleModsExpand(canvasId);
      } else {
        body.style.display = 'none';
        arrow.textContent = '▶';
      }
    };
  }

  // ─── Download orchestration ─────────────────────────────────────────────────
  async function downloadCanvas(canvasId) {
    var auth = InzoiAuth.read();
    if (!auth || !auth.token) { showToast('Not logged in at canvas.playinzoi.com', false); return; }

    updatePanelProgress('Connecting...', 0);
    var ws = new InzoiRPC();
    try {
      await ws.connect();
      updatePanelProgress('Logging in...', 8);
      await ws.login({ accountId: auth.accountId, token: auth.token });
      console.log('[InzoiCanvas] Login OK');

      updatePanelProgress('Fetching file list...', 15);
      var result = await ws.getDownloadUrls(canvasId);
      var urls = [].concat(result.DownloadUrls || [], result.DownloadThumbnailUrls || []);
      if (!urls.length) { showToast('Canvas returned no files', false); return; }
      console.log('[InzoiCanvas] Total files:', urls.length);

      updatePanelProgress('Downloading files via proxy...', 20);
      var rawResults = await fetchBlobsViaProxy(urls);

      var files = [], topLevelMeta = null;
      for (var i = 0; i < rawResults.length; i++) {
        var item = rawResults[i];
        var buffer = base64ToArrayBuffer(item.base64);
        var blob = new Blob([buffer]);
        files.push({ path: item.path, blob: blob });
        if (item.path === 'meta.json' && !topLevelMeta) topLevelMeta = await blobToJson(blob);
        var pct = 15 + Math.round(((i+1) / rawResults.length) * 55);
        updatePanelProgress('Downloaded ' + (i+1) + '/' + rawResults.length + ': ' + item.path, pct);
      }

      var catResult = determineCategoryAndSubcategory(window.location.href, topLevelMeta);
      var zipRootPath = catResult.topCategory + '/' + catResult.category + '/' + catResult.subcategory + '/' + canvasId;
      console.log('[InzoiCanvas] ZIP root:', zipRootPath);
      updatePanelProgress('Preparing ZIP...', 72);

      var zipBlob;
      try {
        zipBlob = await buildZip(files, zipRootPath, updatePanelProgress);
      } catch (zipErr) {
        console.error('[InzoiCanvas] ZIP generation failed:', zipErr);
        showToast('Failed to create ZIP: ' + (zipErr.message || 'unknown error'), false);
        updatePanelProgress('Error: ZIP generation failed', 0);
        ws.close();
        return;
      }
      var zipFileName = canvasId + '.zip';
      updatePanelProgress('Saving ZIP...', 99);
      await saveZipViaBackground(zipBlob, zipFileName, true);
      updatePanelProgress('ZIP saved: ' + zipFileName, 100);
      showToast('ZIP saved: ' + zipFileName, true);
      console.log('[InzoiCanvas] ZIP saved OK');

      // Mods are already loaded from page DOM when panel opened — no need to re-inject after download

    } catch (err) {
      console.error('[InzoiCanvas] Download error:', err);
      showToast(err.message || 'Download failed', false);
      updatePanelProgress('Error: ' + (err.message || 'failed'), 0);
    } finally {
      ws.close();
    }
  }

  // ─── UI sync ──────────────────────────────────────────────────────────────
  function syncUiForCurrentRoute() {
    var supported = isSupportedCreationUrl();
    var fabEl = document.getElementById('inzoi-fab');
    var panelEl = document.getElementById('inzoi-dl-panel');
    if (supported) {
      if (!fabEl) createFAB(function() {
        if (document.getElementById('inzoi-dl-panel')) removePanel(); else openPanel();
      });
    } else {
      if (fabEl) fabEl.remove();
      if (panelEl) removePanel();
    }
  }

  // ─── Open panel ────────────────────────────────────────────────────────────
  function openPanel() {
    var auth = InzoiAuth.read();
    var canvasId = extractCanvasId();
    getSettings().then(function(settings) {
      createPanel({
        isLoggedIn: !!auth.token,
        canvasId: canvasId,
        authAccountId: auth.accountId || '',
      }, function onDownload() {
        var btn = document.getElementById('inzoi-dl-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Working...'; }
        var pc = document.getElementById('inzoi-progress-container');
        if (pc) pc.style.display = 'block';
        downloadCanvas(canvasId).then(function() {
          var btn2 = document.getElementById('inzoi-dl-btn');
          if (btn2) {
            btn2.textContent = '✅ ZIP Saved';
            btn2.style.background = 'linear-gradient(135deg,#00c864,#00a854)';
          }
        }).catch(function() {
          var btn2 = document.getElementById('inzoi-dl-btn');
          if (btn2) {
            btn2.textContent = '❌ Error';
            btn2.style.background = 'linear-gradient(135deg,#ff4444,#cc0000)';
            setTimeout(function() { resetDownloadButton(btn2); }, 3000);
          }
        });
      });
      // Scrape canvas name and mods from page immediately
      updateCanvasNameInPanel();
      // Small delay to let dynamic content settle
      setTimeout(function() { updateModsInPanelFromPage(); }, 300);
      // Init updater UI (lazy + manual check) now that footer exists
      initUpdaterUi(document.getElementById('inzoi-version-footer'));
    }).catch(function() {});
  }

  // ─── Version footer (placeholder — updater init in openPanel) ──────────────
  function initVersionFooter() {
    var el = document.getElementById('inzoi-version-footer');
    if (!el) return;
    el.textContent = '';
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────
  installUiEventGuard();
  installRouteWatcher(syncUiForCurrentRoute);
  syncUiForCurrentRoute();
  initVersionFooter();
  console.log('[InzoiCanvas] Ready');
})();
