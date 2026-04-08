// index.js — Chrome Extension entry point
// Orchestruje všechny moduly, wiring FAB + panel + download flow

(function () {
  'use strict';

  console.log('[InzoiCanvas] Extension loaded');

  // ─── Install UI event guard ───────────────────────────────────────────────
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
  async function saveWithPicker(blob, fileName) {
    if (window.showSaveFilePicker) {
      var handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
      });
      var writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'picker';
    }
    throw new Error('showSaveFilePicker not available');
  }

  async function saveToAutoDirectory(blob, fileName) {
    if (!window.showDirectoryPicker) throw new Error('showDirectoryPicker not available');

    var dirHandle = await getRememberedDirectoryHandle(true);
    if (!dirHandle) {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await rememberDirectoryHandle(dirHandle);
    }

    var fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    var writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'auto-directory';
  }

  // ─── Fetch via background proxy (CORS bypass) ──────────────────────────────
  async function fetchBlobsViaProxy(urls, onProgress) {
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ type: 'FETCH_BLOBS', urls: urls }, function(resp) {
        if (!resp) {
          reject(new Error('Background proxy not responding'));
          return;
        }
        if (!resp.ok) {
          reject(new Error(resp.error || 'Fetch failed'));
          return;
        }
        resolve(resp.results);
      });
    });
  }

  // ─── Download orchestration ─────────────────────────────────────────────────
  async function downloadCanvas(canvasId) {
    var auth = InzoiAuth.read();
    if (!auth || !auth.token) {
      showToast('Nejsi přihlášený na canvas.playinzoi.com', false);
      return;
    }

    updatePanelProgress('Connecting...', 0);

    var ws = new InzoiRPC();
    try {
      await ws.connect();
      updatePanelProgress('Logging in...', 8);

      await ws.login({ accountId: auth.accountId, token: auth.token });
      console.log('[InzoiCanvas] Login OK');

      updatePanelProgress('Fetching file list...', 15);
      var result = await ws.getDownloadUrls(canvasId);

      var urls = [].concat(result.DownloadUrls || []).concat(result.DownloadThumbnailUrls || []);
      if (!urls.length) {
        showToast('Canvas nevrátil žádné soubory', false);
        return;
      }

      console.log('[InzoiCanvas] Total files:', urls.length);

      // Fetch přes background service worker (CORS bypass)
      updatePanelProgress('Downloading files via proxy...', 20);
      var rawResults = await fetchBlobsViaProxy(urls, function(pct) {
        updatePanelProgress('Downloading... ' + pct + '%', 15 + Math.round(pct * 0.5));
      });

      // Převést ArrayBuffer → Blob + najít meta.json
      var files = [];
      var topLevelMeta = null;

      for (var i = 0; i < rawResults.length; i++) {
        var item = rawResults[i];
        var blob = new Blob([item.data]);
        files.push({ path: item.path, blob: blob });

        if (item.path === 'meta.json' && !topLevelMeta) {
          topLevelMeta = await blobToJson(blob);
        }

        var pct = 15 + Math.round(((i + 1) / rawResults.length) * 55);
        updatePanelProgress('Downloaded ' + (i + 1) + '/' + rawResults.length + ': ' + item.path, pct);
      }

      var catResult = determineCategoryAndSubcategory(window.location.href, topLevelMeta);
      var zipRootPath = catResult.category + '/' + catResult.subcategory + '/' + canvasId;

      console.log('[InzoiCanvas] ZIP root:', zipRootPath);
      updatePanelProgress('Preparing ZIP in ' + catResult.category + '/' + catResult.subcategory + '...', 72);

      var zipBlob = await buildZip(files, zipRootPath, updatePanelProgress);
      var zipFileName = canvasId + '.zip';

      updatePanelProgress('Saving ZIP...', 99);
      var settings = await getSettings();

      if (settings.automaticSave) {
        await saveToAutoDirectory(zipBlob, zipFileName);
        updatePanelProgress('ZIP auto-saved: ' + zipFileName, 100);
        showToast('ZIP auto-saved: ' + zipFileName, true);
      } else {
        await saveWithPicker(zipBlob, zipFileName);
        updatePanelProgress('ZIP saved: ' + zipFileName, 100);
        showToast('ZIP uložen: ' + zipFileName, true);
      }

      console.log('[InzoiCanvas] ZIP saved OK');

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
      if (!fabEl) {
        createFAB(function() {
          var existingPanel = document.getElementById('inzoi-dl-panel');
          if (existingPanel) {
            removePanel();
          } else {
            openPanel();
          }
        });
      }
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
      createPanel(
        {
          isLoggedIn: !!auth.token,
          canvasId: canvasId,
          automaticSave: settings.automaticSave,
          authAccountId: auth.accountId || '',
        },
        function onDownload() {
          var btn = document.getElementById('inzoi-dl-btn');
          if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Working...';
          }
          var progressContainer = document.getElementById('inzoi-progress-container');
          if (progressContainer) progressContainer.style.display = 'block';

          downloadCanvas(canvasId).then(function() {
            if (btn) {
              var toggle = document.getElementById('inzoi-auto-save-toggle');
              btn.textContent = toggle && toggle.checked ? '✅ ZIP Auto-Saved' : '✅ ZIP Saved';
              btn.style.background = 'linear-gradient(135deg,#00c864,#00a854)';
            }
          }).catch(function() {
            if (btn) {
              btn.textContent = '❌ Error';
              btn.style.background = 'linear-gradient(135deg,#ff4444,#cc0000)';
              setTimeout(function() { resetDownloadButton(btn); }, 3000);
            }
          });
        },
        function onAutoSaveToggle(checked) {
          saveSettings({ automaticSave: checked });
        },
        function onResetFolder() {
          clearRememberedDirectoryHandle().then(function() {
            showToast('Remembered folder reset', true);
          }).catch(function() {
            showToast('Failed to reset folder', false);
          });
        }
      );
    });
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────
  installUiEventGuard();
  installRouteWatcher(syncUiForCurrentRoute);
  syncUiForCurrentRoute();

  console.log('[InzoiCanvas] Ready');
})();
