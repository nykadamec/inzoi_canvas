// urlMatcher.js
// Detekce podporovaných /creation/gal-* URL

/**
 * @returns {boolean}
 */
function isSupportedCreationUrl() {
  return /^\/[a-z]{2}-[A-Z]{2}\/creation\/gal-[^/?]+$/i.test(window.location.pathname);
}

/**
 * @returns {string|null} — např. "gal-XXXXXXXXX"
 */
function extractCanvasId() {
  if (!isSupportedCreationUrl()) return null;
  var match = window.location.pathname.match(/\/creation\/(gal-[^/?]+)/i);
  return match ? match[1] : null;
}
