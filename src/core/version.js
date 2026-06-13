(function (root) {
  var APP_VERSION = '0.2.1';
  var BUILD_DATE = '2026-06-13';
  var FALLBACK = '\u2713 v' + APP_VERSION + ' \u00b7 ' + BUILD_DATE;

  function renderFooter(el) {
    if (!el) return;
    try {
      var manifest = (chrome && chrome.runtime && chrome.runtime.getManifest)
        ? chrome.runtime.getManifest() : {};
      var v = manifest.version || APP_VERSION;
      var d = manifest.build_date || BUILD_DATE;
      el.textContent = '\u2713 v' + v + ' \u00b7 ' + d;
    } catch (e) {
      el.textContent = FALLBACK;
    }
  }

  root.AppVersion = {
    APP_VERSION: APP_VERSION,
    BUILD_DATE: BUILD_DATE,
    renderFooter: renderFooter
  };
})(typeof window !== 'undefined' ? window : self);
