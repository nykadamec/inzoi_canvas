// fab.js
// FAB (Floating Action Button) — vytvoření, mount, unmount

var fabInstance = null;

/**
 * Odstraní FAB z DOM
 */
function removeFAB() {
  if (fabInstance) {
    fabInstance.remove();
    fabInstance = null;
  }
}

/**
 * Vytvoří a přidá FAB do body
 * @param {Function} onClick — callback při kliknutí
 */
function createFAB(onClick) {
  removeFAB();

  var fab = document.createElement('div');
  fab.id = 'inzoi-fab';
  fab.innerHTML = '📦';
  fab.title = 'Inzoi Canvas ZIP';
  fab.style.cssText = [
    'position:fixed',
    'bottom:30px',
    'right:30px',
    'z-index:99998',
    'width:56px',
    'height:56px',
    'border-radius:50%',
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-size:24px',
    'background:linear-gradient(135deg,#e94560,#c73659)',
    'color:white',
    'box-shadow:0 8px 24px rgba(233,69,96,.45)',
    'user-select:none',
  ].join(';');

  fab.onmouseenter = function() { fab.style.transform = 'scale(1.08)'; };
  fab.onmouseleave = function() { fab.style.transform = 'scale(1)'; };

  // Zabránit propagate events na host app
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach(function(type) {
    fab.addEventListener(type, function(e) {
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }, true);
  });

  fab.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    onClick && onClick();
  });

  document.body.appendChild(fab);
  fabInstance = fab;
}
