// settingsStore.js
// Settings persistence přes chrome.storage.local

var SETTINGS_KEY = 'inzoiCanvasSettings';

/**
 * @returns {Promise<{automaticSave: boolean}>}
 */
function getSettings() {
  return new Promise(function(resolve) {
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
  });
}

/**
 * @param {{automaticSave: boolean}} settings
 */
function saveSettings(settings) {
  chrome.storage.local.set(
    (function() {
      var obj = {};
      obj[SETTINGS_KEY] = JSON.stringify({ automaticSave: !!settings.automaticSave });
      return obj;
    })()
  );
}

/**
 * @param {{automaticSave: boolean}} settings
 * @returns {Promise<void>}
 */
async function saveSettingsAsync(settings) {
  return new Promise(function(resolve) {
    var data = {};
    data[SETTINGS_KEY] = JSON.stringify({ automaticSave: !!settings.automaticSave });
    chrome.storage.local.set(data, resolve);
  });
}
