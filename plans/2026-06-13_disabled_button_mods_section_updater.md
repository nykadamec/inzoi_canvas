# Plán: Disabled download button + skrytí prázdné mods sekce + vlastní Updater

**Projekt:** Inzoi Canvas Downloader (Chrome Extension MV3)
**Datum:** 2026-06-13
**Verze:** 0.1.1 → cíl 0.2.0

---

## Přehled změn

Tři nezávislé featury do Chrome extension:

1. **Disabled download button** — když uživatel není přihlášený, tlačítko `inzoi-dl-btn` bude disabled (šedé) s tooltipem vysvětlujícím důvod.
2. **Skrytí mods sekce** — pokud `Required Mods = 0`, celý `#inzoi-mods-section` se v panelu vůbec nezobrazí.
3. **Vlastní Updater** — nový dedikovaný modul `src/background/updater.js` s notifikačním systémem v panelu (footer badge), manuálním tlačítkem „Check for updates" a GitHub Releases API jako zdrojem verzí.

---

## 1. Disabled download button

### 1.1 Cíl
Když `InzoiAuth.isLoggedIn() === false`, tlačítko `#inzoi-dl-btn` v panelu:
- vizuálně šedé (ne červený gradient)
- `disabled = true`
- `cursor: not-allowed`
- po `mouseenter` zobrazí custom tooltip: **„Pro stažení se musíte přihlásit na canvas.playinzoi.com"**
- po kliku se nic nestane (kromě tooltipu)

Když je přihlášen → chování beze změny.

### 1.2 Dotčené soubory

- **`src/content/ui/panel.js`** — `createPanel()` (řádky 153–154)
  - Změnit inline `style` tlačítka: přidat `disabled` atribut a `cursor:pointer`/`not-allowed` podle `isLoggedIn`
  - Přidat custom tooltip přes existující `showTooltip(text, e)` helper (řádky 32–58) — stejný mechanismus jako pro `inzoi-account-id`
  - Přidat `mouseenter` / `mouseleave` listenery

- **`src/content/index.js`** — `openPanel()` (řádky 391–424)
  - V `onDownload` handleru (řádek 399) přidat guard: pokud `!isLoggedIn`, vrátit se (pojistka)

### 1.3 Logika v `panel.js` (v bloku `if (isCreationPage)`)

```js
'<button id="inzoi-dl-btn" ' + (isLoggedIn ? '' : 'disabled ') +
  'style="width:100%;padding:16px 20px;' +
  'background:' + (isLoggedIn ? 'linear-gradient(135deg,#e94560,#c73659)' : 'linear-gradient(135deg,#555,#333)') + ';' +
  'border:none;border-radius:12px;color:white;' +
  'cursor:' + (isLoggedIn ? 'pointer' : 'not-allowed') + ';' +
  'font-weight:700;font-size:15px;letter-spacing:.3px;margin-bottom:8px;' +
  'box-shadow:' + (isLoggedIn ? '0 4px 14px rgba(233,69,96,.35)' : 'none') + ';' +
  'opacity:' + (isLoggedIn ? '1' : '0.55') + ';">' +
  '📦 Download ZIP</button>'
```

### 1.4 Tooltip listener (přidat za stávající `btn.onclick`)

```js
if (!isLoggedIn) {
  btn.addEventListener('mouseenter', function(e) {
    showTooltip('Pro stažení se musíte přihlásit na canvas.playinzoi.com', e);
  });
  btn.addEventListener('mousemove', function(e) {
    if (tooltipEl) {
      // stejná logika jako u accountIdEl (kopírujeme z řádků 208–220)
    }
  });
  btn.addEventListener('mouseleave', function() { hideTooltip(); });
}
```

### 1.5 Test
- Odhlášený uživatel → otevřít creation page → FAB → panel
- Tlačítko je šedé, neaktivní, kurzor `not-allowed`
- Hover → tooltip s textem
- Klik → nic se nestane
- Přihlásit se → reload panelu (zavřít+otevřít) → tlačítko aktivní červené

---

## 2. Skrytí prázdné Mods sekce

### 2.1 Cíl
Pokud `scrapeModsFromPage()` vrátí `null` nebo prázdné pole (tj. Required Mods = 0), celý `#inzoi-mods-section` se v panelu **vůbec nevykreslí** (žádný placeholder, žádný header).

### 2.2 Aktuální stav (řešení v `index.js` `updateModsInPanelFromPage()` řádky 170–209)

```js
if (!mods || mods.length === 0) {
  body.style.display = 'none';
  arrowEl.textContent = '▶';
  return;
}
```
Aktuálně se `inzoi-mods-section` vždy vyrenderuje v `panel.js` (řádky 130–151), jen se `body` skryje a počet se nastaví na 0.

### 2.3 Dotčené soubory

- **`src/content/index.js`** — `updateModsInPanelFromPage()` (řádky 170–209)
  - Místo `body.style.display = 'none'` nastavit `section.style.display = 'none'`

### 2.4 Plánovaná logika

V `index.js`:

```js
function updateModsInPanelFromPage() {
  var section = document.getElementById('inzoi-mods-section');
  if (!section) return;

  var mods = scrapeModsFromPage();

  if (!mods || mods.length === 0) {
    // Required Mods = 0 → celá sekce se NEzobrazuje
    section.style.display = 'none';
    return;
  }

  // mods existují — zobrazit sekci
  section.style.display = '';
  // ... zbytek původní logiky (count, rows, body.innerHTML)
}
```

### 2.5 Edge case: jak zjistit, že Required Mods = 0?

`scrapeModsFromPage()` aktuálně vrací:
- `null` pokud sekce „Mod Info" na stránce vůbec není (tj. žádné mods)
- pole (i prázdné) pokud sekce existuje ale je prázdná

Logika `(!mods || mods.length === 0)` pokrývá oba případy.

### 2.6 Test
- Creation page BEZ required mods → otevřít panel → `#inzoi-mods-section` v DOM s `display:none`
- Creation page S required mods (≥1) → sekce je viditelná, rozevírací, s tabulkou
- Page bez Mod Info úplně → stejné jako bez mods

---

## 3. Vlastní Updater (nový modul)

### 3.1 Cíl
Dedikovaný modul `src/background/updater.js` s:

- **Source:** GitHub Releases API
  - `https://api.github.com/repos/nykadamec/inzoi_canvas/releases/latest`
  - Vrací JSON `{ tag_name, body (changelog), html_url, assets: [{ browser_download_url }] }`
  - `tag_name` formát: `v0.2.0` → verze `0.2.0` (odebrat prefix `v`)
  - `assets[0].browser_download_url` → download URL pro ZIP/CRX
- **Trigger:**
  1. **Pasivní:** při otevření panelu (lazy check)
  2. **Manuální:** tlačítko „Check for updates" v patičce panelu
- **UI notifikace:** footer panelu zobrazí text nového updatu (stávající vzor), klik otevře release page na GitHubu
- **Cache:** výsledek poslední kontroly uložen v `chrome.storage.local` pod klíčem `inzoiLastUpdateCheck` na 1h (TTL)

### 3.2 Architektura

**Nové soubory:**
- `src/background/updater.js` — logika kontroly verzí, parsování GitHub API, build odpovědi pro content script
- `src/content/ui/updaterUi.js` — UI hooky: badge ve footeru, tlačítko „Check for updates", stavové texty

**Změněné soubory:**
- `manifest.json` — přidat `https://api.github.com/*` do `host_permissions`
- `src/background/service-worker.js` — `importScripts('updater.js')`; nový handler `CHECK_UPDATE`; **smazat** `handleCheckUpdate`/`compareVersions`/`UPDATE_MANIFEST_URL` (řádky 128–174)
- `src/content/index.js` — nahradit `checkForUpdate()` (řádky 440–457) novou logikou z `updaterUi.js`; sloučit se `setVersionFooter()`

### 3.3 API contract (message protocol)

**Content → Background:**
```js
{ type: 'CHECK_UPDATE', force?: boolean }
```
- `force = true` → ignoruje cache, vždycky hitne GitHub API
- `force = false/undefined` → vrátí cache pokud je < 1h stará

**Background → Content (odpověď):**
```js
{
  ok: true,
  result: {
    hasUpdate: boolean,
    currentVersion: string,    // '0.1.1'
    latestVersion: string|null, // '0.2.0' nebo null při chybě
    changelog: string|null,     // markdown z release body
    downloadUrl: string|null,   // GitHub release html_url (fallback)
    assetUrl: string|null,      // první asset .zip/.crx
    publishedAt: string|null,
    error: string|null,
  }
}
```

### 3.4 Struktura `updater.js`

```js
var CACHE_KEY = 'inzoiLastUpdateCheck';
var CACHE_TTL_MS = 60 * 60 * 1000;
var GITHUB_REPO = 'nykadamec/inzoi_canvas';
var GITHUB_API = 'https://api.github.com/repos/' + GITHUB_REPO + '/releases/latest';

function compareVersions(v1, v2) { /* ... */ }

function getCachedCheck() { /* chrome.storage.local */ }
function setCachedCheck(data) { /* chrome.storage.local */ }

async function fetchLatestRelease() { /* GET GitHub API, parse */ }

async function handleCheckUpdate(force) {
  // 1. cache check (pokud !force)
  // 2. fetch + uložit do cache
  // 3. vrátit normalizovaný objekt s hasUpdate/logy
}

self.InzoiUpdater = { handleCheckUpdate: handleCheckUpdate };
```

### 3.5 `updaterUi.js` — render

- **Update dostupný:** `↻ Install v0.2.0` (modře, klikatelné) → otevře `downloadUrl` v novém tabu
- **Up to date:** `v0.1.1 · up to date` + tlačítko `Check for updates`
- **Chyba:** `v0.1.1 · update check failed` + tlačítko
- **Během checku:** text `Checking…`, tlačítko disabled

### 3.6 `manifest.json` diff
```diff
   "host_permissions": [
     "https://canvas.playinzoi.com/*",
     "https://cdn.canvas.playinzoi.com/*",
     "https://api.canvas.playinzoi.com/*",
     "https://api.curseforge.com/*",
-    "https://raw.githubusercontent.com/*"
+    "https://raw.githubusercontent.com/*",
+    "https://api.github.com/*"
   ],
```

### 3.7 Test
- Release v0.2.0 na GitHubu + lokálně 0.1.1 → footer `↻ Install v0.2.0`, klik otevře release
- Aktuální verze = latest → `v0.1.1 · up to date` + tlačítko
- „Check for updates" → `Checking…` → výsledek
- Offline → `update check failed`
- Cache: 2 otevření do 1h → druhý z cache
- `tag_name = "v0.2.0"` → `latestVersion = "0.2.0"`
- Release bez assetů → `assetUrl = null`, fallback `html_url`

---

## Pořadí implementace
1. **Disabled download button** (panel.js + index.js) — malá, izolovaná změna
2. **Skrytí mods sekce** (index.js) — 5 řádků
3. **Updater** (nový soubor + service worker + index.js + manifest) — největší, nechat nakonec

## Verzování
- Po dokončení všech 3 featur: bump `version` v `manifest.json` z `0.1.1` → `0.2.0`, aktualizovat `build_date` na `2026-06-13`.

## Migrace / back-compat
- Žádná data migrace nutná — `chrome.storage.local` klíč `inzoiLastUpdateCheck` je nový.

## Rizika
- **GitHub API rate limit** — 60 req/h neautentizovaně. S 1h cache na uživatele je to OK.
- **MV3 service worker může být kdykoli ukončen** — proto se cache persistuje do `chrome.storage.local`, ne do paměti.
- **importScripts v service worker** — funguje v MV3, ale pouze relativní cesty v rámci extension balíčku.
