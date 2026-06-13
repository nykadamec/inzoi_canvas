// settingsStore.js
// Settings persistence — Chrome extension: chrome.storage.local | Fallback: localStorage

var SETTINGS_KEY = 'inzoiCanvasSettings';

/**
 * @returns {Promise<{automaticSave: boolean}>}
 */
function getSettings() {
  return new Promise(function(resolve) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([SETTINGS_KEY], function(result) {
        var raw = result[SETTINGS_KEY];
        if (!raw) {
          resolve({ automaticSave: false });
          return;
        }
        try {
          var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          resolve({ automaticSave: !!parsed.automaticSave });
        } catch (e) {
          resolve({ automaticSave: false });
        }
      });
    } else {
      // Fallback pro isolated context bez chrome.storage
      try {
        var raw2 = localStorage.getItem(SETTINGS_KEY);
        if (!raw2) {
          resolve({ automaticSave: false });
          return;
        }
        var parsed2 = JSON.parse(raw2);
        resolve({ automaticSave: !!parsed2.automaticSave });
      } catch (e) {
        resolve({ automaticSave: false });
      }
    }
  });
}

/**
 * @param {{automaticSave: boolean}} settings
 */
function saveSettings(settings) {
  var data = { automaticSave: !!settings.automaticSave };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    var obj = {};
    obj[SETTINGS_KEY] = JSON.stringify(data);
    chrome.storage.local.set(obj);
  } else {
    // Fallback
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[InzoiCanvas] saveSettings fallback failed:', e);
    }
  }
}
