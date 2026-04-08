# Inzoi Canvas Downloader — Chrome Extension MVP Design Spec

**Datum:** 2026-04-08  
**Typ:** Migration — Userscript → Chrome Extension (MV3)  
**Stav:** Draft

---

## 1. Cíl migrace

Převést stávající Tampermonkey userscript na **Chrome extension (Manifest V3)** pro lokální použití (unpacked).

### Zachovat z userscriptu

- WebSocket RPC flow (`Account.LoginReq`, `Canvas.DownloadCanvasItemReq`)
- ZIP struktura: `<Category>/<Subcategory>/<canvasId>/...`
- FAB + panel UI na `/creation/gal-*`
- SPA route watcher
- Event guard proti interference s host UI
- Settings persistence + auto-save directory handle

### Necíl (MVP fáze)

- Chrome Web Store publikace
- Background service worker
- Retry systém
- Options page
- Popup UI

---

## 2. Zvolená architektura

### Přístup: Modulární MVP

Čtyři vrstvy s jasnými odpovědnostmi:

| Vrstva | Obsah | Odpovědnost |
|--------|-------|------------|
| Extension shell | `manifest.json` | Registrace content scriptu, permissions |
| Content/UI | `content/index.js`, `ui/`, `utils/` | FAB, panel, route watcher, event guard, orchestrace |
| Core | `core/*` | Auth reader, RPC, downloader, ZIP, category resolver |
| Persistence | `storage/*` | Settings (`chrome.storage.local`), directory handle (IndexedDB) |

### Proč takto

- UI a business logika oddělené → snadné testování
- Core je přenositelný mimo extension context
- Pozdější přechod na store-ready release bez velkého refaktoru
- Žádný background service worker → jednodušší lifecycle

---

## 3. Struktura souborů

```
inzoi-canvas-extension/
├── src/
│   ├── manifest.json
│   │
│   ├── content/
│   │   ├── index.js              # entry point
│   │   ├── ui/
│   │   │   ├── fab.js            # FAB vytvoření + mount
│   │   │   ├── panel.js          # panel UI + stav
│   │   │   └── styles.css        # sdílené styly
│   │   └── utils/
│   │       ├── urlMatcher.js     # detekce /creation/gal-*
│   │       └── routeWatcher.js   # SPA history + MutationObserver
│   │
│   ├── core/
│   │   ├── authReader.js         # čtení session z page localStorage
│   │   ├── rpcClient.js          # WebSocket RPC (login, download req)
│   │   ├── canvasDownloader.js   # fetch blobů z CDN URLs
│   │   ├── zipBuilder.js         # JSZip + folder struktura
│   │   └── categoryResolver.js   # Category/Subcategory logika
│   │
│   └── storage/
│       ├── settingsStore.js      # chrome.storage.local wrapper
│       └── directoryHandleStore.js # IndexedDB pro directory handle
│
├── vendor/
│   └── jszip.min.js              # JSZip 3.9.1 (bundled)
│
└── icons/
    └── ...                       # volitelné pro MVP
```

---

## 4. Data flow

### Inicializace

1. Content script se načte na `canvas.playinzoi.com` (`document_idle`).
2. Spustí se `routeWatcher`.
3. URL matcher: odpovídá `/creation/gal-*`? ANO → mount FAB, NE → unmount UI.

### Otevření panelu

1. Klik na FAB otevře panel.
2. Panel načte: auth status, `automaticSave` (chrome storage), remembered directory handle.

### Download flow

1. Uživatel klikne `Download ZIP`.
2. Načte `canvasId` z URL + auth data.
3. WebSocket: `Account.LoginReq` → `Canvas.DownloadCanvasItemReq`.
4. Stáhnout všechny bloby z `DownloadUrls`.
5. Pokud existuje `meta.json`, předat `categoryResolveru`.
6. `zipBuilder` vytvoří ZIP: `<Category>/<Subcategory>/<canvasId>/...`
7. Uložení:
   - auto-save ON → remembered folder (showSaveFilePicker s handle)
   - auto-save OFF → showSaveFilePicker bez handle

### SPA změny

- Při změně route: revalidovat URL → mount/unmount.
- Odchod z `gal-*` → zavřít panel.

---

## 5. API náhrady

| Userscript | Chrome Extension |
|------------|-----------------|
| `GM_getValue` / `GM_setValue` | `chrome.storage.local` |
| `GM_xmlhttpRequest` | `fetch()` přímý (s host_permissions) |
| `==UserScript==` header | `manifest.json` |
| `@match` | `content_scripts.matches` |
| `@require JSZip` | `vendor/jszip.min.js` bundlovaný |
| SPA watcher (userscript) | `routeWatcher.js` (stejná logika, v content scriptu) |

---

## 6. CORS strategie

**Zvolený přístup: host_permissions + přímý fetch**

Manifest deklaruje:

```json
"host_permissions": [
  "https://canvas.playinzoi.com/*",
  "https://cdn.canvas.playinzoi.com/*",
  "https://api.canvas.playinzoi.com/*"
]
```

Content script stahuje assety přímo přes `fetch()` bez background proxy.

Pokud by některé requesty selhaly na CORS → fallback na background messaging (není součást MVP).

---

## 7. Chybové stavy (MVP fail-fast)

| Situace | Chování |
|---------|---------|
| Auth missing | Jasná hláška „not logged in" |
| RPC fail / timeout | Toast + reset tlačítka |
| Download fail | Fail-fast, žádné retry |
| Save denied | Hláška + fallback na ruční save |

---

## 8. Manifest

```json
{
  "manifest_version": 3,
  "name": "Inzoi Canvas Downloader",
  "version": "1.0.0",
  "permissions": ["storage"],
  "host_permissions": [
    "https://canvas.playinzoi.com/*",
    "https://cdn.canvas.playinzoi.com/*",
    "https://api.canvas.playinzoi.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://canvas.playinzoi.com/*"],
      "js": [
        "vendor/jszip.min.js",
        "src/core/authReader.js",
        "src/core/rpcClient.js",
        "src/core/canvasDownloader.js",
        "src/core/zipBuilder.js",
        "src/core/categoryResolver.js",
        "src/storage/settingsStore.js",
        "src/storage/directoryHandleStore.js",
        "src/content/utils/urlMatcher.js",
        "src/content/utils/routeWatcher.js",
        "src/content/ui/fab.js",
        "src/content/ui/panel.js",
        "src/content/index.js"
      ],
      "css": ["src/content/ui/styles.css"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["vendor/jszip.min.js"],
      "matches": ["https://canvas.playinzoi.com/*"]
    }
  ]
}
```

---

## 9. Definition of Done

MVP je hotové, pokud:

- [ ] Extension jde načíst jako unpacked v Chrome bez chyb
- [ ] FAB se zobrazuje pouze na `/creation/gal-*`
- [ ] Panel funguje (otevírání, zavírání, progress)
- [ ] Download vytvoří validní ZIP archiv
- [ ] ZIP má strukturu `<Category>/<Subcategory>/<canvasId>/...`
- [ ] Toggle „Automatic save" funguje a persistuje přes restart
- [ ] UI nerozbíjí interakce host stránky (event guard funguje)
- [ ] SPA navigace funguje bez reloadu stránky

---

## 10. Migrační fáze

| Fáze | Obsah |
|------|-------|
| 1 | Skeleton: `manifest.json` + adresářová struktura |
| 2 | Core logika: auth reader, RPC, downloader, ZIP, category resolver |
| 3 | Persistence: `chrome.storage.local` + IndexedDB directory handle |
| 4 | UI vrstva: FAB, panel, progress, event guard |
| 5 | SPA integrace: route watcher, mount/unmount |
| 6 | MVP testování: všechny scenáře z Definition of Done |
| 7 | Lokální distribuce: load as unpacked + instrukce |

---

## 11. Out of scope (tato fáze)

- Background service worker
- Chrome Web Store publikace
- Retry systém pro download
- Options page
- Popup UI
- Telemetry / logging

---

## 12. Rizika a mitigace

| Riziko | Mitigace |
|--------|---------|
| CORS na CDN | host_permissions deklarované, fallback na background messaging později |
| File System Access API limity | Jasná UX hláška + fallback na ruční save |
| SPA race conditions | Debounce route handling + idempotent mount/unmount |
| Service worker lifecycle (pokud se přidá) | Pro MVP řešeno vše v content scriptu |
