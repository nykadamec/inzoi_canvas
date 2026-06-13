// panel.js
// Panel UI — creation, update, progress, toast

var panelInstance = null;
var tooltipEl = null;

/**
 * Remove panel from DOM
 */
function removePanel() {
  if (panelInstance) {
    panelInstance.remove();
    panelInstance = null;
  }
}

/**
 * Remove custom tooltip from DOM
 */
function removeTooltip() {
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
  }
}

/**
 * Show custom tooltip anchored to cursor
 * @param {string} text
 * @param {MouseEvent} e
 */
function showTooltip(text, e) {
  removeTooltip();
  tooltipEl = document.createElement('div');
  tooltipEl.id = 'inzoi-tooltip';
  tooltipEl.textContent = text;
  document.body.appendChild(tooltipEl);

  var x = e.clientX;
  var y = e.clientY;
  var tw = tooltipEl.offsetWidth;
  var th = tooltipEl.offsetHeight;

  if (y + th + 16 > window.innerHeight) {
    y = y - th - 12;
  } else {
    y = y + 14;
  }
  if (x + tw + 16 > window.innerWidth) {
    x = window.innerWidth - tw - 16;
  }

  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
  requestAnimationFrame(function() {
    if (tooltipEl) tooltipEl.classList.add('visible');
  });
}

/**
 * Hide custom tooltip
 */
function hideTooltip() {
  removeTooltip();
}

/**
 * @param {{ isLoggedIn: boolean, canvasId: string|null, modInfo: Array|null, authAccountId: string }} opts
 * @param {Function} onDownload
 * @param {Function} onModsExpand
 */
function createPanel(opts, onDownload, onModsExpand) {
  removePanel();

  var isLoggedIn = !!opts.isLoggedIn;
  var canvasId = opts.canvasId;
  var isCreationPage = !!canvasId;

  var panel = document.createElement('div');
  panel.id = 'inzoi-dl-panel';
  panel.style.cssText = [
    'position:fixed',
    'left:auto',
    'top:60px',
    'right:20px',
    'z-index:99999',
    'background:linear-gradient(145deg,#1a1a2e,#0f0f23)',
    'color:#eee',
    'padding:20px',
    'border-radius:16px',
    'min-width:340px',
    'width:380px',
    'box-shadow:0 10px 32px rgba(0,0,0,.5)',
    'border:1px solid rgba(255,255,255,.08)',
    'font:13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
  ].join(';');

  // Account ID — short version
  var shortAccountId = opts.authAccountId
    ? '…' + opts.authAccountId.slice(-6)
    : '';

  panel.innerHTML = [
    // Header
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">',
      '<span style="font-size:14px;font-weight:700;color:#e94560;letter-spacing:.3px;">📦 Downloader</span>',
      '<div style="display:flex;align-items:center;gap:6px;">',
        '<span style="font-size:10px;font-weight:500;color:' + (isLoggedIn ? '#00c864' : '#ff5050') + ';">' + (isLoggedIn ? 'Logged in' : 'Not logged in') + '</span>',
        '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + (isLoggedIn ? '#00c864' : '#ff5050') + ';flex-shrink:0;"></span>',
        (isLoggedIn && shortAccountId ? '<span id="inzoi-account-id" style="font-size:9px;color:#555;font-family:monospace;cursor:pointer;" title="Click to copy">' + shortAccountId + '</span>' : ''),
        '<button id="inzoi-close" style="background:none;border:none;color:#555;font-size:18px;cursor:pointer;padding:0;line-height:1;margin-left:4px;">×</button>',
      '</div>',
    '</div>',

    isCreationPage ? [

      // Canvas name
      '<div style="margin-bottom:12px;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:6px;border-left:2px solid #e94560;">',
        '<div style="font-size:10px;color:#666;margin-bottom:2px;">Name</div>',
        '<div id="inzoi-canvas-name" style="font-size:11px;font-weight:600;color:#eee;word-break:break-word;line-height:1.3;">Loading...</div>',
      '</div>',

      // Canvas ID
      '<div style="margin-bottom:12px;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:6px;border-left:2px solid #60a5fa;">',
        '<div style="font-size:10px;color:#666;margin-bottom:2px;">Canvas</div>',
        '<div id="inzoi-canvas-id" style="font-size:11px;font-family:monospace;color:#60a5fa;word-break:break-all;">' + canvasId + '</div>',
      '</div>',

      // Mods section (collapsed by default)
      '<div id="inzoi-mods-section" style="margin-top:14px;margin-bottom:12px;">',
        '<div id="inzoi-mods-header" style="',
          'padding:12px;border-radius:8px;',
          'background:rgba(255,255,255,.05);',
          'border:1px solid rgba(255,255,255,.06);',
          'cursor:pointer;user-select:none;',
          'display:flex;justify-content:space-between;align-items:center;',
          'transition:background .2s ease;',
          '">',
          '<span id="inzoi-mods-count" style="font-size:12px;font-weight:600;">🎯 Required mods</span>',
          '<span id="inzoi-mods-arrow" style="color:#888;font-size:12px;transition:transform .25s ease;">▶</span>',
        '</div>',
        '<div id="inzoi-mods-body" style="',
          'overflow:hidden;',
          'transition:opacity .25s ease, max-height .3s ease;',
          'opacity:0;',
          'max-height:0;',
          'display:block;',
          '">',
          '<div id="inzoi-mods-table-wrapper" style="padding-top:8px;"></div>',
        '</div>',
      '</div>',

      // Download button
      '<button id="inzoi-dl-btn" style="width:100%;padding:16px 20px;background:linear-gradient(135deg,#e94560,#c73659);border:none;border-radius:12px;color:white;cursor:pointer;font-weight:700;font-size:15px;letter-spacing:.3px;margin-bottom:8px;box-shadow:0 4px 14px rgba(233,69,96,.35);">📦 Download ZIP</button>',

      // Save location
      '<div style="margin-bottom:12px;font-size:10px;color:#555;padding:0 2px;text-align:center;">',
        'Saves to your browser\'s default download folder',
      '</div>',

      // Progress
      '<div id="inzoi-progress-container" style="display:none;margin-bottom:12px;">',
        '<div id="inzoi-status" style="font-size:12px;margin-bottom:6px;color:#aaa;"></div>',
        '<div style="height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;">',
          '<div id="inzoi-progress-fill" style="height:100%;background:linear-gradient(90deg,#e94560,#60a5fa);width:0%;transition:width .25s;border-radius:3px;"></div>',
        '</div>',
        '<div id="inzoi-progress-text" style="font-size:10px;color:#666;text-align:right;margin-top:3px;"></div>',
      '</div>',

    ].join('') : [

      '<div style="padding:20px;text-align:center;color:#666;font-size:12px;border-radius:8px;background:rgba(255,255,255,.04);">',
        'Open a creation page to download<br>',
        '<span style="font-size:11px;color:#555;">e.g. /creation/gal-XXXXXXXXX</span>',
      '</div>',

    ].join(''),

    // Footer
    '<div id="inzoi-version-footer" style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:#555;text-align:center;"></div>',
  ].join('');

  // Event guard
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach(function(type) {
    panel.addEventListener(type, function(e) {
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }, true);
  });

  document.body.appendChild(panel);
  panelInstance = panel;

  // Close button
  document.getElementById('inzoi-close').onclick = function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    removePanel();
  };

  // Account ID — click to copy, hover tooltip
  var accountIdEl = document.getElementById('inzoi-account-id');
  if (accountIdEl) {
    accountIdEl.addEventListener('mouseenter', function(e) {
      showTooltip('Click to copy: ' + opts.authAccountId, e);
    });
    accountIdEl.addEventListener('mousemove', function(e) {
      if (tooltipEl) {
        var x = e.clientX;
        var y = e.clientY;
        var tw = tooltipEl.offsetWidth;
        var th = tooltipEl.offsetHeight;
        if (y + th + 16 > window.innerHeight) y = y - th - 12;
        else y = y + 14;
        if (x + tw + 16 > window.innerWidth) x = window.innerWidth - tw - 16;
        tooltipEl.style.left = x + 'px';
        tooltipEl.style.top = y + 'px';
      }
    });
    accountIdEl.addEventListener('mouseleave', function() { hideTooltip(); });
    accountIdEl.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      navigator.clipboard.writeText(opts.authAccountId).then(function() {
        showTooltip('Copied!', e);
        setTimeout(function() { hideTooltip(); }, 1500);
      }).catch(function() {
        showTooltip('Copy failed', e);
      });
    });
  }

  // Download button
  if (isCreationPage) {
    var btn = document.getElementById('inzoi-dl-btn');
    if (btn) {
      btn.onclick = function(e) { onDownload && onDownload(e); };
    }
  }

  // Mods section init — structure already in panel.innerHTML, just wire up click
  var modSection = document.getElementById('inzoi-mods-section');
  if (modSection) {
    var existingBody = document.getElementById('inzoi-mods-body');
    if (existingBody) {
      // Ensure body starts hidden
      existingBody.style.maxHeight = '0px';
      existingBody.style.opacity = '0';
    }

    document.getElementById('inzoi-mods-header').onclick = function() {
      var body = document.getElementById('inzoi-mods-body');
      var arrow = document.getElementById('inzoi-mods-arrow');
      if (!body) return;
      var isClosed = body.style.maxHeight === '0px' || body.style.maxHeight === '';
      if (isClosed) {
        body.style.maxHeight = '400px';
        body.style.opacity = '1';
        if (arrow) { arrow.style.transform = 'rotate(180deg)'; arrow.textContent = '▼'; }
        onModsExpand && onModsExpand();
      } else {
        body.style.maxHeight = '0px';
        body.style.opacity = '0';
        if (arrow) { arrow.style.transform = 'rotate(0deg)'; arrow.textContent = '▶'; }
      }
    };
  }

  // Version footer
  var footerEl = document.getElementById('inzoi-version-footer');
  if (footerEl) {
    try {
      var mf = chrome.runtime.getManifest();
      var buildDate = '2026-06-06';
      footerEl.textContent = '\u2713 v0.1.1 \u00b7 ' + buildDate;
    } catch (e) {
      footerEl.textContent = '\u2713 v0.1.1 \u00b7 2026-06-06';
    }
  }
}

/**
 * Update progress bar
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
 * Re-enable download button after completion / error
 */
function resetDownloadButton(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = '📦 Download ZIP';
  btn.style.background = 'linear-gradient(135deg,#e94560,#c73659)';
}

/**
 * Show toast message
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
  setTimeout(function() { el.remove(); }, 5000);
}
