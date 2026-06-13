// routeWatcher.js
// SPA watcher — detekuje změny route (pushState, replaceState, popstate, hashchange)
// + MutationObserver jako fallback

var lastHref = null;

function installRouteWatcher(onRouteChange) {
  lastHref = location.href;

  function handleChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    console.log('[InzoiCanvas:router] Route changed:', location.href);
    setTimeout(onRouteChange, 50);
  }

  // Wrap pushState
  var _pushState = history.pushState;
  history.pushState = function() {
    var result = _pushState.apply(this, arguments);
    handleChange();
    return result;
  };

  // Wrap replaceState
  var _replaceState = history.replaceState;
  history.replaceState = function() {
    var result = _replaceState.apply(this, arguments);
    handleChange();
    return result;
  };

  // popstate + hashchange
  window.addEventListener('popstate', handleChange);
  window.addEventListener('hashchange', handleChange);

  // MutationObserver fallback
  var observer = new MutationObserver(function() {
    if (location.href !== lastHref) handleChange();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
