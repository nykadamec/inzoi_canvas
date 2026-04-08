// panel.js
// Panel UI — vytvoření, aktualizace, progress, toast

var panelInstance = null;

/**
 * Odstraní panel z DOM
 */
function removePanel() {
  if (panelInstance) {
    panelInstance.remove();
    panelInstance = null;
  }
}

/**
 * @param {{ isLoggedIn: boolean, canvasId: string|null, automaticSave: boolean }} opts
 * @param {Function} onDownload — click handler pro Download ZIP
 * @param {Function} onAutoSaveToggle — změna auto-save toggle
 * @param {Function} onResetFolder — reset folder handler
 */
function createPanel(opts, onDownload, onAutoSaveToggle, onResetFolder) {
  removePanel();

  var isLoggedIn = !!opts.isLoggedIn;
  var canvasId = opts.canvasId;
  var isCreationPage = !!canvasId;
  var autoSave = !!opts.automaticSave;

  var panel = document.createElement('div');
  panel.id = 'inzoi-dl-panel';
  panel.style.cssText = [
    'position:fixed',
    'top:60px',
    'right:20px',
    'z-index:99999',
    'background:linear-gradient(145deg,#1a1a2e,#0f0f23)',
    'color:#eee',
    'padding:20px',
    'border-radius:16px',
    'min-width:340px',
    'max-width:430px',
    'box-shadow:0 10px 32px rgba(0,0,0,.5)',
    'border:1px solid rgba(255,255,255,.08)',
    'font:13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
  ].join(';');

  var statusBg = isLoggedIn
    ? 'rgba(0,200,100,.15)'
    : 'rgba(255,80,80,.15)';
  var statusBorder = isLoggedIn
    ? 'rgba(0,200,100,.3)'
    : 'rgba(255,80,80,.3)';
  var statusText = isLoggedIn
    ? '✅ Logged in'
    : '❌ Not logged in';

  panel.innerHTML = [
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">',
      '<h3 style="margin:0;color:#e94560;font-size:16px;">📦 Inzoi Canvas ZIP</h3>',
      '<button id="inzoi-close" style="background:none;border:none;color:#777;font-size:22px;cursor:pointer;">×</button>',
    '</div>',

    '<div style="padding:12px;border-radius:8px;margin-bottom:12px;background:' + statusBg + ';border:1px solid ' + statusBorder + ';">',
      '<div style="color:#888;font-size:11px;margin-bottom:4px;">Status</div>',
      '<div style="font-weight:600;">' + statusText + '</div>',
      (isLoggedIn ? '<div style="font-size:10px;color:#888;margin-top:4px;font-family:monospace;">' + opts.authAccountId + '</div>' : ''),
    '</div>',

    isCreationPage ? [
      '<div style="padding:12px;border-radius:8px;margin-bottom:12px;background:rgba(255,255,255,.05);">',
        '<div style="color:#888;font-size:11px;margin-bottom:4px;">Canvas ID</div>',
        '<div style="font-family:monospace;font-size:12px;word-break:break-all;color:#60a5fa;">' + canvasId + '</div>',
      '</div>',

      '<div style="padding:12px;border-radius:8px;margin-bottom:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);">',
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">',
          '<div>',
            '<div style="font-size:12px;font-weight:600;">Automatic save, without ask</div>',
            '<div style="font-size:11px;color:#888;margin-top:2px;">Saves to remembered folder directly.</div>',
          '</div>',
          '<label style="display:flex;align-items:center;cursor:pointer;">',
            '<input id="inzoi-auto-save-toggle" type="checkbox"' + (autoSave ? ' checked' : '') + ' style="width:18px;height:18px;cursor:pointer;" />',
          '</label>',
        '</div>',
        '<div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;">',
          '<div id="inzoi-save-mode-label" style="font-size:11px;color:#888;">' + (autoSave ? 'Mode: auto-save to remembered folder' : 'Mode: ask where to save each ZIP') + '</div>',
          '<button id="inzoi-reset-folder-btn" style="padding:6px 10px;background:transparent;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#bbb;font-size:11px;cursor:pointer;">Reset folder</button>',
        '</div>',
      '</div>',

      '<button id="inzoi-dl-btn" style="width:100%;padding:14px 20px;background:linear-gradient(135deg,#e94560,#c73659);border:none;border-radius:10px;color:white;cursor:pointer;font-weight:600;font-size:14px;">📦 Download ZIP</button>',

      '<div id="inzoi-progress-container" style="margin-top:12px;display:none;">',
        '<div id="inzoi-status" style="font-size:12px;margin-bottom:8px;"></div>',
        '<div style="height:8px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden;">',
          '<div id="inzoi-progress-fill" style="height:100%;background:linear-gradient(90deg,#e94560,#60a5fa);width:0%;transition:width .25s;"></div>',
        '</div>',
        '<div id="inzoi-progress-text" style="font-size:10px;color:#888;text-align:right;margin-top:4px;"></div>',
      '</div>',
    ].join('') : [
      '<div style="padding:12px;border-radius:8px;background:rgba(255,255,255,.05);text-align:center;color:#888;">',
        'Otevři detail creation stránky<br><span style="font-size:11px;">např. /creation/gal-XXXXXXXXX</span>',
      '</div>',
    ].join(''),

    '<div style="margin-top:15px;padding-top:15px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:#666;text-align:center;">',
      'JSZip 3.9.1 + File System Access API',
    '</div>',
  ].join('');

  // Event guard — zabránit propagate na host app
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach(function(type) {
    panel.addEventListener(type, function(e) {
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }, true);
  });

  document.body.appendChild(panel);
  panelInstance = panel;

  // Zavřít tlačítko
  document.getElementById('inzoi-close').onclick = function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    removePanel();
  };

  if (isCreationPage) {
    var btn = document.getElementById('inzoi-dl-btn');
    var progressContainer = document.getElementById('inzoi-progress-container');
    var autoToggle = document.getElementById('inzoi-auto-save-toggle');
    var modeLabel = document.getElementById('inzoi-save-mode-label');
    var resetFolderBtn = document.getElementById('inzoi-reset-folder-btn');

    autoToggle.onchange = function() {
      onAutoSaveToggle && onAutoSaveToggle(autoToggle.checked);
      modeLabel.textContent = autoToggle.checked
        ? 'Mode: auto-save to remembered folder'
        : 'Mode: ask where to save each ZIP';
      showToast(autoToggle.checked ? 'Automatic save enabled' : 'Automatic save disabled', true);
    };

    resetFolderBtn.onclick = function() {
      onResetFolder && onResetFolder();
    };

    btn.onclick = function() {
      onDownload && onDownload();
    };
  }
}

/**
 * Aktualizuje progress bar
 * @param {string} status
 * @param {number} pct — 0–100
 */
function updatePanelProgress(status, pct) {
  var statusEl = document.getElementById('inzoi-status');
  var fillEl = document.getElementById('inzoi-progress-fill');
  var textEl = document.getElementById('inzoi-progress-text');
  var container = document.getElementById('inzoi-progress-container');

  if (container) container.style.display = 'block';
  if (statusEl) statusEl.textContent = status;
  if (fillEl) fillEl.style.width = pct + '%';
  if (textEl) textEl.textContent = pct + '%';
}

/**
 * Odemkne download tlačítko po dokončení / chybě
 */
function resetDownloadButton(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = '📦 Download ZIP';
  btn.style.background = 'linear-gradient(135deg,#e94560,#c73659)';
}

/**
 * Zobrazí toast zprávu
 * @param {string} message
 * @param {boolean} ok
 */
function showToast(message, ok) {
  var el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'bottom:90px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:9999999',
    'padding:12px 18px',
    'border-radius:12px',
    'color:white',
    'background:' + (ok
      ? 'linear-gradient(135deg,#00c864,#00a854)'
      : 'linear-gradient(135deg,#ff4444,#cc0000)'),
    'box-shadow:0 8px 24px rgba(0,0,0,.35)',
    'font:14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
  ].join(';');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 3500);
}
