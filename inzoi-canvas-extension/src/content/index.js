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
  function proxySend(msg) {
    return new Promise(function(res, rej) {
      try {
        chrome.runtime.sendMessage(msg, function(resp) {
          if (!resp) { rej(new Error('Extension context invalidated')); return; }
          if (!resp.ok) { rej(new Error(resp.error || 'Proxy error')); return; }
          res(resp.results);
        });
      } catch (e) { rej(e); }
    });
  }

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
    if (!auth || !auth.token) { showToast('Nejsi přihlášený na canvas.playinzoi.com', false); return; }

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
      if (!urls.length) { showToast('Canvas nevrátil žádné soubory', false); return; }
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

      var zipBlob = await buildZip(files, zipRootPath, updatePanelProgress);
      var zipFileName = canvasId + '.zip';
      updatePanelProgress('Saving ZIP...', 99);
      var settings = await getSettings();

      if (settings.automaticSave) {
        await saveZipViaBackground(zipBlob, zipFileName, false);
        updatePanelProgress('ZIP auto-saved: ' + zipFileName, 100);
        showToast('ZIP auto-saved: ' + zipFileName, true);
      } else {
        await saveZipViaBackground(zipBlob, zipFileName, true);
        updatePanelProgress('ZIP saved: ' + zipFileName, 100);
        showToast('ZIP uložen: ' + zipFileName, true);
      }
      console.log('[InzoiCanvas] ZIP saved OK');

      // Inject mods section AFTER download (meta.json is already downloaded)
      injectModsSection(topLevelMeta ? (topLevelMeta.ModInformation || null) : null, canvasId);

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
        automaticSave: settings.automaticSave,
        authAccountId: auth.accountId || '',
      }, function onDownload() {
        var btn = document.getElementById('inzoi-dl-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Working...'; }
        var pc = document.getElementById('inzoi-progress-container');
        if (pc) pc.style.display = 'block';
        downloadCanvas(canvasId).then(function() {
          var btn2 = document.getElementById('inzoi-dl-btn');
          if (btn2) {
            var t = document.getElementById('inzoi-auto-save-toggle');
            btn2.textContent = t && t.checked ? '✅ ZIP Auto-Saved' : '✅ ZIP Saved';
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
      }, function onAutoSaveToggle(checked) { saveSettings({ automaticSave: checked }); },
        function onResetFolder() {
          clearRememberedDirectoryHandle().then(function() { showToast('Remembered folder reset', true); })
            .catch(function() { showToast('Failed to reset folder', false); });
        });
    }).catch(function() {});
  }

  // ─── Version footer ──────────────────────────────────────────────────────────
  function setVersionFooter() {
    var el = document.getElementById('inzoi-version-footer');
    if (!el) return;
    try {
      var manifest = chrome.runtime.getManifest();
      var version = manifest.version || '1.0.0';
      el.textContent = 'version ' + version;
    } catch (e) {
      el.textContent = 'version 0.1.0';
    }
  }

  // ─── Update checker ─────────────────────────────────────────────────────────
  function checkForUpdate() {
    proxySend({ type: 'CHECK_UPDATE' }).then(function(info) {
      if (info.hasUpdate) {
        var el = document.getElementById('inzoi-version-footer');
        if (el) {
          el.textContent = 'Inzoi Canvas Downloader v' + info.currentVersion + ' \u2192 Update v' + info.newVersion + ' available!';
          el.style.color = '#60a5fa';
          el.style.cursor = 'pointer';
          el.title = 'Click to download update';
          el.onclick = function() {
            if (info.downloadUrl) window.open(info.downloadUrl, '_blank');
          };
        }
      }
    }).catch(function() {});
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────
  installUiEventGuard();
  installRouteWatcher(syncUiForCurrentRoute);
  syncUiForCurrentRoute();
  setVersionFooter();
  checkForUpdate();
  console.log('[InzoiCanvas] Ready');
})();
