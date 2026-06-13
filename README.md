# Inzoi Canvas Downloader

A Chrome extension (Manifest V3) that lets you download any [inZOI Canvas](https://canvas.playinzoi.com) creation as a ZIP archive — without launching the game.

When you open a creation page, a small floating 📦 button appears. Click it to get a side panel with one-click download, the required mods list, and update notifications.

## Features

- **One-click ZIP download** of any canvas creation
- **Correct folder structure** for `Canvas/<Category>/<Subcategory>/<canvasId>/` (see [CANVAS_API_STRUCTURE](https://github.com/nykadamec/inzoi_canvas))
- **Required Mods panel** with deep links to CurseForge (auto-scraped from the page, no API rate limits)
- **In-extension auto-updater** that checks GitHub Releases on every panel open (1h cache, manual force-refresh button)
- **Smart UI behavior:**
  - Download button is **disabled with a tooltip** when you're not logged in
  - "Required Mods" section is **hidden entirely** when zero mods are needed
  - No empty placeholders, no broken buttons
- **MV3-safe** — uses an event-driven service worker for CORS-free blob downloads; the updater runs in the content script to avoid SW termination issues

## Screenshots

The extension adds a floating 📦 FAB to every creation page. Click it to open the side panel:

- Top: **logged in / not logged in** indicator + short account ID (click to copy)
- **Name** of the creation (scraped from the page)
- **Canvas ID** (e.g. `gal-XXXXXXXXX`)
- **Required mods** list (when present) with CurseForge links — collapsible
- **Download ZIP** button — disabled if not logged in
- **Progress bar** with status messages
- **Footer** with current version + auto-update check

## Installation

### From a release (recommended)
1. Download the latest `inzoi-canvas-vX.Y.Z.zip` from the [Releases](../../releases) page
2. Unzip it anywhere on your computer
3. Open `chrome://extensions/`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked** and select the unzipped `inzoi_canvas` folder
6. The extension is now active on `canvas.playinzoi.com`

### From source
```bash
git clone https://github.com/nykadamec/inzoi_canvas.git
cd inzoi_canvas
# Then follow steps 3-6 above, pointing Load unpacked at this directory
```

## Usage

1. Make sure you're **logged in** at [canvas.playinzoi.com](https://canvas.playinzoi.com)
2. Navigate to any creation page, e.g. `https://canvas.playinzoi.com/cs-CZ/creation/gal-XXXXXXXXX`
3. A small floating 📦 button appears in the bottom-right corner
4. Click it to open the panel
5. (Optional) Expand **Required mods** to see links to each mod on CurseForge
6. Click **📦 Download ZIP** — pick where to save it
7. Done! Unzip in your `Documents/My Games/inZOI/UserData/Canvas/` folder (or wherever the game expects Canvas content)

## How it works

The download process uses three layers:

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   Content script    │     │  Service worker      │     │  Remote APIs        │
│   (inzoi_canvas UI) │     │  (CORS proxy)        │     │                     │
│                     │     │                      │     │                     │
│  - FAB              │     │  - WebSocket login   │     │  - canvas.playinzoi  │
│  - Side panel       │ ──► │  - chrome.downloads  │ ──► │  - cdn.canvas...    │
│  - GitHub updater   │     │  - CurseForge proxy  │     │  - api.curseforge   │
└─────────────────────┘     └──────────────────────┘     │  - api.github.com   │
                                                          └─────────────────────┘
```

1. **WebSocket login** to `wss://api.canvas.playinzoi.com` using your saved session token
2. **Get download URLs** for all files in the creation
3. **Fetch all files** via the service worker (CORS-free)
4. **Build a ZIP** with the correct folder structure using JSZip
5. **Save** via `chrome.downloads.download` (with a Save As dialog)

Your session token is read from the page's `localStorage` — same mechanism the game itself uses. The token never leaves your browser except for the WebSocket login and the file downloads (which the game would do anyway).

## Required permissions

Declared in `manifest.json`:

| Permission | Why |
|---|---|
| `storage` | Cache for the updater (1h TTL) and settings |
| `downloads` | Save the ZIP file (declared, but the actual API call runs in the service worker) |

### Host permissions

| Host | Why |
|---|---|
| `https://canvas.playinzoi.com/*` | Your own session, file downloads via the game backend |
| `https://cdn.canvas.playinzoi.com/*` | Where the actual creation files live |
| `https://api.canvas.playinzoi.com/*` | WebSocket login (in service worker) |
| `https://api.curseforge.com/*` | Required mods lookup (in service worker) |
| `https://api.github.com/*` | Updater checks GitHub Releases (in content script) |

## Project layout

```
inzoi_canvas/
├── manifest.json              # Extension manifest (MV3)
├── icons/                     # (empty — Chrome will use default)
├── vendor/
│   └── jszip.min.js           # JSZip 3.9.1 (bundled)
├── src/
│   ├── background/
│   │   └── service-worker.js  # CORS proxy + ZIP save + asset download
│   ├── core/
│   │   ├── authReader.js      # Reads session token from localStorage
│   │   ├── canvasDownloader.js
│   │   ├── categoryResolver.js # Determines Canvas/<Category>/<Subcategory>
│   │   ├── rpcClient.js       # WebSocket RPC client (login, getDownloadUrls)
│   │   ├── version.js
│   │   └── zipBuilder.js      # JSZip wrapper
│   ├── storage/
│   │   └── settingsStore.js   # chrome.storage.local wrapper
│   └── content/
│       ├── index.js           # Content script entry point — orchestrates everything
│       ├── ui/
│       │   ├── fab.js         # Floating 📦 button
│       │   ├── panel.js       # Side panel
│       │   ├── updaterCache.js # GitHub Releases API + cache (1h TTL)
│       │   └── updaterUi.js   # Footer update badge + manual check button
│       └── utils/
│           ├── proxy.js       # Shared proxySend for chrome.runtime.sendMessage
│           ├── routeWatcher.js # SPA route change detection
│           └── urlMatcher.js  # Matches /creation/gal-* URLs
└── plans/                     # Implementation plans (one file per feature)
```

## Development

There's no build step — just edit the files in `src/` and reload the extension in `chrome://extensions/` (click the refresh icon).

To test syntax before committing:
```bash
node --check src/background/service-worker.js
node --check src/content/index.js
# etc.
```

To validate the manifest:
```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
```

## Releases & versioning

The version in `manifest.json` is the single source of truth. The updater compares it to the latest `tag_name` from the [GitHub Releases API](https://api.github.com/repos/nykadamec/inzoi_canvas/releases/latest).

Release tags follow `vX.Y.Z` (the `v` prefix is stripped before comparison). The first attached `.zip` / `.crx` / `.xpi` asset is offered for download via the **Install vX.Y.Z** button.

## Privacy

- No data leaves your browser except the requests the game itself makes
- The GitHub Releases API call only fetches public release metadata (tag, body, asset URLs) — no authentication, no user info
- The CurseForge API call (for mod lookups) uses an anonymous API key bundled with the extension — no user identification
- Nothing is logged, tracked, or sent to any third party

## Contributing

PRs welcome. Open an issue first for non-trivial changes so we can discuss the design.

For multi-feature work, please create a plan file in `plans/` (one file per feature or release) before implementing. This keeps the conversation history useful and makes the git log much more readable.

## License

MIT
