// ==UserScript==
// @name         Inzoi Canvas Downloader
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  Download Inzoi Canvas as ZIP using JSZip 3.9.1 + FileSaver.js
// @match        https://canvas.playinzoi.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      cdn.canvas.playinzoi.com
// @connect      api.canvas.playinzoi.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.9.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        WS_URL: 'wss://api.canvas.playinzoi.com',
        DEBUG: true,
        ZIP_COMPRESSION: 'STORE',
        SETTINGS_KEY: 'inzoiCanvasSettings',
        IDB_NAME: 'inzoiCanvasDownloaderDB',
        IDB_STORE: 'handles',
        AUTO_SAVE_DIR_KEY: 'autoSaveDirectoryHandle',
    };

    function log(...args) {
        if (CONFIG.DEBUG) console.log('[InzoiCanvas]', ...args);
    }

    function getSettings() {
        try {
            const raw = GM_getValue(CONFIG.SETTINGS_KEY, null);
            if (!raw) return { automaticSave: false };
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return {
                automaticSave: !!parsed.automaticSave,
            };
        } catch {
            return { automaticSave: false };
        }
    }

    function saveSettings(settings) {
        GM_setValue(CONFIG.SETTINGS_KEY, JSON.stringify({
            automaticSave: !!settings.automaticSave,
        }));
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(CONFIG.IDB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(CONFIG.IDB_STORE)) {
                    db.createObjectStore(CONFIG.IDB_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbGet(key) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONFIG.IDB_STORE, 'readonly');
            const req = tx.objectStore(CONFIG.IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbSet(key, value) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONFIG.IDB_STORE, 'readwrite');
            const req = tx.objectStore(CONFIG.IDB_STORE).put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async function idbDelete(key) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONFIG.IDB_STORE, 'readwrite');
            const req = tx.objectStore(CONFIG.IDB_STORE).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async function ensureHandlePermission(handle, request = false) {
        if (!handle) return false;
        const opts = { mode: 'readwrite' };
        try {
            if (await handle.queryPermission(opts) === 'granted') return true;
            if (request && await handle.requestPermission(opts) === 'granted') return true;
        } catch (e) {
            log('Handle permission error:', e);
        }
        return false;
    }

    async function getRememberedDirectoryHandle(request = false) {
        try {
            const handle = await idbGet(CONFIG.AUTO_SAVE_DIR_KEY);
            if (!handle) return null;
            const ok = await ensureHandlePermission(handle, request);
            if (!ok) {
                await idbDelete(CONFIG.AUTO_SAVE_DIR_KEY);
                return null;
            }
            return handle;
        } catch (e) {
            log('Failed to load remembered dir handle:', e);
            return null;
        }
    }

    async function rememberDirectoryHandle(handle) {
        await idbSet(CONFIG.AUTO_SAVE_DIR_KEY, handle);
    }

    async function clearRememberedDirectoryHandle() {
        await idbDelete(CONFIG.AUTO_SAVE_DIR_KEY);
    }

    async function saveBlobWithPicker(blob, fileName) {
        if (window.showSaveFilePicker) {
            const showSaveFilePickerBound = window.showSaveFilePicker.bind(window);
            const handle = await showSaveFilePickerBound({
                suggestedName: fileName,
                types: [{
                    description: 'ZIP archive',
                    accept: { 'application/zip': ['.zip'] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return 'picker';
        }
        if (typeof saveAs !== 'undefined') {
            saveAs(blob, fileName);
            return 'filesaver';
        }
        throw new Error('No supported save method');
    }

    async function saveBlobToAutoDirectory(blob, fileName) {
        if (!window.showDirectoryPicker) {
            throw new Error('Automatic save requires Chromium File System Access API');
        }

        let dirHandle = await getRememberedDirectoryHandle(true);
        if (!dirHandle) {
            const showDirectoryPickerBound = window.showDirectoryPicker.bind(window);
            dirHandle = await showDirectoryPickerBound({ mode: 'readwrite' });
            await rememberDirectoryHandle(dirHandle);
        }

        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return 'auto-directory';
    }

    function getAuthData() {
        try {
            const raw = localStorage.getItem('auth');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const state = parsed?.state || parsed;
            return {
                accountId: state.authData?.AccountId || state.accountId,
                token: state.authData?.AccessToken || state.accessToken,
                refreshToken: state.authData?.RefreshToken || state.refreshToken,
            };
        } catch (e) {
            log('Auth parse error:', e);
            return null;
        }
    }

    class InzoiWS {
        constructor() {
            this.ws = null;
            this.pending = new Map();
            this.id = 0;
            this.connected = false;
        }

        connect() {
            return new Promise((resolve, reject) => {
                log('Connecting to WebSocket...');
                this.ws = new WebSocket(CONFIG.WS_URL);

                this.ws.onopen = () => {
                    this.connected = true;
                    log('WebSocket connected');
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        this.handleMessage(msg);
                    } catch (e) {
                        log('WS parse error:', e);
                    }
                };

                this.ws.onerror = (e) => {
                    this.connected = false;
                    reject(e);
                };

                this.ws.onclose = () => {
                    this.connected = false;
                };

                setTimeout(() => {
                    if (!this.connected) reject(new Error('Connection timeout'));
                }, 10000);
            });
        }

        handleMessage(msg) {
            if (!msg.id || !this.pending.has(msg.id)) return;
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message || 'RPC Error'));
            else resolve(msg.result || msg);
        }

        send(method, params = {}) {
            return new Promise((resolve, reject) => {
                if (!this.connected || this.ws.readyState !== WebSocket.OPEN) {
                    reject(new Error('Not connected'));
                    return;
                }

                const id = ++this.id;
                this.pending.set(id, { resolve, reject });
                log('Sending:', method);
                this.ws.send(JSON.stringify({
                    jsonrpc: '2.0',
                    method,
                    params: [params],
                    id,
                }));

                setTimeout(() => {
                    if (this.pending.has(id)) {
                        this.pending.delete(id);
                        reject(new Error(`Timeout for ${method}`));
                    }
                }, 15000);
            });
        }

        close() {
            try { this.ws?.close(); } catch {}
            this.ws = null;
            this.connected = false;
        }
    }

    function isSupportedCreationUrl() {
        return /^\/[a-z]{2}-[A-Z]{2}\/creation\/gal-[^/?]+$/i.test(window.location.pathname);
    }

    function extractCanvasId() {
        if (!isSupportedCreationUrl()) return null;
        const match = window.location.pathname.match(/\/creation\/(gal-[^/?]+)/i);
        return match ? match[1] : null;
    }

    function extractRelativePath(url) {
        try {
            const cleanUrl = url.split('?')[0];
            const parts = cleanUrl.split('/');
            const ugcIndex = parts.indexOf('ugc');
            if (ugcIndex >= 0 && ugcIndex + 2 < parts.length) {
                return parts.slice(ugcIndex + 2).join('/');
            }
            return parts[parts.length - 1] || 'file.dat';
        } catch {
            return 'file.dat';
        }
    }

    function fetchBlob(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                timeout: 60000,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) resolve(res.response);
                    else reject(new Error(`HTTP ${res.status}`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Download timeout')),
            });
        });
    }

    async function blobToJson(blob) {
        try {
            const text = await blob.text();
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    function determineCategoryAndSubcategory(canvasUrl, metaData = null) {
        let category = 'Creations';
        let subcategory = 'General';

        const lowerUrl = (canvasUrl || '').toLowerCase();
        if (lowerUrl.includes('/aigenerated/') || lowerUrl.includes('/ai-generated/')) {
            category = 'AIGenerated';
        } else if (lowerUrl.includes('/canvas/')) {
            category = 'Canvas';
        } else if (lowerUrl.includes('/creation/') || lowerUrl.includes('/creations/')) {
            category = 'Creations';
        }

        if (metaData && typeof metaData === 'object') {
            const contentType = metaData.type || metaData.Type || metaData.category || metaData.Category || '';
            if (contentType) {
                const contentTypeLower = String(contentType).toLowerCase();
                if (contentTypeLower.includes('ai') || contentTypeLower.includes('generated')) category = 'AIGenerated';
                else if (contentTypeLower.includes('canvas')) category = 'Canvas';
                else if (contentTypeLower.includes('creation')) category = 'Creations';
            }

            const tags = metaData.tags || metaData.Tags || [];
            const systemTags = metaData.SystemTags || metaData.systemTags || [];
            if (Array.isArray(tags) && tags.length) {
                const tagsStr = tags.join(' ').toLowerCase();
                if (tagsStr.includes('ai') || tagsStr.includes('generated')) category = 'AIGenerated';
                else if (tagsStr.includes('canvas')) category = 'Canvas';
                else if (tagsStr.includes('creation')) category = 'Creations';
            }

            if ('ApperanceFilter' in metaData || 'AppearanceFilter' in metaData) {
                subcategory = 'MyAppearances';
                category = 'Canvas';
            } else if ('SubCategory' in metaData) {
                const subCat = metaData.SubCategory;
                if (subCat === 'ImportedTexture') {
                    subcategory = 'MyTextures';
                    category = 'Creations';
                } else if (subCat === 'Appearance') {
                    subcategory = 'MyAppearances';
                    category = 'Canvas';
                } else if (subCat === 'Character') {
                    subcategory = 'MyCharacters';
                    category = 'Canvas';
                } else if (subCat === 'Face') {
                    subcategory = 'MyFaces';
                    category = 'Canvas';
                } else if (subCat === 'Clothes' || subCat === 'Outfit') {
                    subcategory = 'MyClothes';
                    category = 'Canvas';
                } else if (subCat === 'House' || subCat === 'Property') {
                    subcategory = 'MyHouses';
                    category = 'Canvas';
                } else if (subCat === 'Room') {
                    subcategory = 'MyRooms';
                    category = 'Canvas';
                } else if (subCat === 'Furniture' || subCat === 'Craft') {
                    subcategory = 'MyFurniture';
                    category = 'Canvas';
                }
            } else if (Array.isArray(systemTags) && systemTags.length) {
                const systemTagsStr = systemTags.join(' ').toLowerCase();
                if (systemTagsStr.includes('texture') || systemTagsStr.includes('importedtexture')) {
                    subcategory = 'MyTextures';
                    category = 'Creations';
                } else if (systemTagsStr.includes('appearance')) {
                    subcategory = 'MyAppearances';
                    category = 'Canvas';
                } else if (systemTagsStr.includes('character')) {
                    subcategory = 'MyCharacters';
                    category = 'Canvas';
                } else if (systemTagsStr.includes('face')) {
                    subcategory = 'MyFaces';
                    category = 'Canvas';
                } else if (systemTagsStr.includes('clothes') || systemTagsStr.includes('outfit')) {
                    subcategory = 'MyClothes';
                    category = 'Canvas';
                } else if (systemTagsStr.includes('house') || systemTagsStr.includes('property')) {
                    subcategory = 'MyHouses';
                    category = 'Canvas';
                } else if (systemTagsStr.includes('room')) {
                    subcategory = 'MyRooms';
                    category = 'Canvas';
                } else if (systemTagsStr.includes('furniture') || systemTagsStr.includes('craft')) {
                    subcategory = 'MyFurniture';
                    category = 'Canvas';
                }
            } else if ('Configuration' in metaData) {
                const config = String(metaData.Configuration).toLowerCase();
                if (['garmentpreset', 'headpreset', 'makeuppreset', 'stylingpreset'].includes(config)) {
                    subcategory = 'MyAppearances';
                    category = 'Canvas';
                } else if (config === 'character') {
                    subcategory = 'MyCharacters';
                    category = 'Canvas';
                }
            }
        }

        return { category, subcategory };
    }

    let panel = null;

    function updateUI(status, progress) {
        const statusEl = document.getElementById('inzoi-status');
        const bar = document.getElementById('inzoi-progress-fill');
        const text = document.getElementById('inzoi-progress-text');
        if (statusEl) statusEl.textContent = status;
        if (bar) bar.style.width = `${progress}%`;
        if (text) text.textContent = `${progress}%`;
    }

    function showToast(message, ok = true) {
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
            z-index: 999999; padding: 12px 18px; border-radius: 12px; color: white;
            background: ${ok ? 'linear-gradient(135deg,#00c864,#00a854)' : 'linear-gradient(135deg,#ff4444,#cc0000)'};
            box-shadow: 0 8px 24px rgba(0,0,0,.35); font: 14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;
        `;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    async function buildZip(files, zipRootPath) {
        const zip = new JSZip();
        const root = zip.folder(zipRootPath);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            root.file(file.path, file.blob);
            if (i % 4 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        log('Generating ZIP with JSZip 3.9.1...');
        const startedAt = Date.now();

        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: CONFIG.ZIP_COMPRESSION,
            streamFiles: true,
        }, (metadata) => {
            const percent = Math.max(75, Math.min(99, Math.round(75 + metadata.percent * 0.24)));
            updateUI(`Generating ZIP... ${metadata.percent.toFixed(0)}%`, percent);
        });

        log('ZIP generated in', Date.now() - startedAt, 'ms');
        return zipBlob;
    }

    async function downloadCanvasAsZip(canvasId) {
        const settings = getSettings();
        const auth = getAuthData();
        if (!auth?.token) throw new Error('Nejsi přihlášený na canvas.playinzoi.com');
        if (typeof JSZip === 'undefined') throw new Error('JSZip se nenačetl');
        if (typeof saveAs === 'undefined') throw new Error('FileSaver.js se nenačetl');

        const ws = new InzoiWS();
        try {
            updateUI('Connecting...', 0);
            await ws.connect();

            updateUI('Logging in...', 8);
            await ws.send('Account.LoginReq', {
                AccountId: auth.accountId,
                Token: auth.token,
                AuthedType: 'None',
            });
            log('Login successful');

            updateUI('Fetching file list...', 15);
            const result = await ws.send('Canvas.DownloadCanvasItemReq', {
                canvasItemId: canvasId,
            });
            log('Download info received');

            const urls = [
                ...(result.DownloadUrls || []),
                ...(result.DownloadThumbnailUrls || []),
            ];

            if (!urls.length) throw new Error('Canvas nevrátil žádné soubory');

            log('Total files:', urls.length);
            const files = [];
            let topLevelMeta = null;

            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];
                const path = extractRelativePath(url);
                const blob = await fetchBlob(url);
                files.push({ path, blob });
                if (path === 'meta.json' && !topLevelMeta) {
                    topLevelMeta = await blobToJson(blob);
                }
                const progress = 15 + Math.round(((i + 1) / urls.length) * 55);
                updateUI(`Downloaded ${i + 1}/${urls.length}: ${path}`, progress);
                log('Downloaded:', path);
            }

            const { category, subcategory } = determineCategoryAndSubcategory(window.location.href, topLevelMeta);
            const zipRootPath = `${category}/${subcategory}/${canvasId}`;
            log('ZIP root path:', zipRootPath, { topLevelMeta });

            updateUI(`Preparing ZIP in ${category}/${subcategory}...`, 72);
            const zipBlob = await buildZip(files, zipRootPath);

            updateUI('Saving ZIP...', 100);
            const zipFileName = `${canvasId}.zip`;
            if (settings.automaticSave) {
                await saveBlobToAutoDirectory(zipBlob, zipFileName);
                updateUI(`✅ ZIP auto-saved: ${zipFileName}`, 100);
                showToast(`ZIP auto-saved: ${zipFileName}`, true);
            } else {
                await saveBlobWithPicker(zipBlob, zipFileName);
                updateUI(`✅ ZIP saved: ${zipFileName}`, 100);
                showToast(`ZIP uložen: ${zipFileName}`, true);
            }
            log('ZIP saved');
        } finally {
            ws.close();
        }
    }

    function createPanel() {
        panel?.remove();
        const canvasId = extractCanvasId();
        const auth = getAuthData();
        const settings = getSettings();
        const isLoggedIn = !!auth?.token;
        const isCreationPage = !!canvasId;

        panel = document.createElement('div');
        panel.id = 'inzoi-dl-panel';
        panel.style.cssText = `
            position: fixed; top: 60px; right: 20px; z-index: 99999;
            background: linear-gradient(145deg,#1a1a2e,#0f0f23); color: #eee;
            padding: 20px; border-radius: 16px; min-width: 340px; max-width: 430px;
            box-shadow: 0 10px 32px rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.08);
            font: 13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;
        `;

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
                <h3 style="margin:0;color:#e94560;font-size:16px;">📦 Inzoi Canvas ZIP</h3>
                <button id="inzoi-close" style="background:none;border:none;color:#777;font-size:22px;cursor:pointer;">×</button>
            </div>

            <div style="padding:12px;border-radius:8px;margin-bottom:12px;background:${isLoggedIn ? 'rgba(0,200,100,.15)' : 'rgba(255,80,80,.15)'};border:1px solid ${isLoggedIn ? 'rgba(0,200,100,.3)' : 'rgba(255,80,80,.3)'};">
                <div style="color:#888;font-size:11px;margin-bottom:4px;">Status</div>
                <div style="font-weight:600;">${isLoggedIn ? '✅ Logged in' : '❌ Not logged in'}</div>
                ${isLoggedIn ? `<div style="font-size:10px;color:#888;margin-top:4px;font-family:monospace;">${auth.accountId}</div>` : ''}
            </div>

            ${isCreationPage ? `
                <div style="padding:12px;border-radius:8px;margin-bottom:12px;background:rgba(255,255,255,.05);">
                    <div style="color:#888;font-size:11px;margin-bottom:4px;">Canvas ID</div>
                    <div style="font-family:monospace;font-size:12px;word-break:break-all;color:#60a5fa;">${canvasId}</div>
                </div>

                <div style="padding:12px;border-radius:8px;margin-bottom:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                        <div>
                            <div style="font-size:12px;font-weight:600;">Automatic save, without ask</div>
                            <div style="font-size:11px;color:#888;margin-top:2px;">Uses remembered folder and saves ${canvasId}.zip directly.</div>
                        </div>
                        <label style="display:flex;align-items:center;cursor:pointer;">
                            <input id="inzoi-auto-save-toggle" type="checkbox" ${settings.automaticSave ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;" />
                        </label>
                    </div>
                    <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <div id="inzoi-save-mode-label" style="font-size:11px;color:#888;">${settings.automaticSave ? 'Mode: auto-save to remembered folder' : 'Mode: ask where to save each ZIP'}</div>
                        <button id="inzoi-reset-folder-btn" style="padding:6px 10px;background:transparent;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#bbb;font-size:11px;cursor:pointer;">Reset folder</button>
                    </div>
                </div>

                <button id="inzoi-dl-btn" style="width:100%;padding:14px 20px;background:linear-gradient(135deg,#e94560,#c73659);border:none;border-radius:10px;color:white;cursor:pointer;font-weight:600;font-size:14px;">📦 Download ZIP</button>
                <div id="inzoi-progress-container" style="margin-top:12px;display:none;">
                    <div id="inzoi-status" style="font-size:12px;margin-bottom:8px;"></div>
                    <div style="height:8px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden;">
                        <div id="inzoi-progress-fill" style="height:100%;background:linear-gradient(90deg,#e94560,#60a5fa);width:0%;transition:width .25s;"></div>
                    </div>
                    <div id="inzoi-progress-text" style="font-size:10px;color:#888;text-align:right;margin-top:4px;"></div>
                </div>
            ` : `
                <div style="padding:12px;border-radius:8px;background:rgba(255,255,255,.05);text-align:center;color:#888;">
                    Otevři detail creation stránky<br><span style="font-size:11px;">např. /creation/gal-XXXXXXXXX</span>
                </div>
            `}

            <div style="margin-top:15px;padding-top:15px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:#666;text-align:center;">
                JSZip 3.9.1 + FileSaver.js
            </div>
        `;

        const swallowPanelPressEvent = (event) => {
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        };

        ['pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach((type) => {
            panel.addEventListener(type, swallowPanelPressEvent, true);
        });

        document.body.appendChild(panel);
        document.getElementById('inzoi-close').onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
            panel.remove();
        };

        if (isCreationPage) {
            const btn = document.getElementById('inzoi-dl-btn');
            const progressContainer = document.getElementById('inzoi-progress-container');
            const autoToggle = document.getElementById('inzoi-auto-save-toggle');
            const modeLabel = document.getElementById('inzoi-save-mode-label');
            const resetFolderBtn = document.getElementById('inzoi-reset-folder-btn');

            autoToggle.onchange = () => {
                const nextSettings = { automaticSave: autoToggle.checked };
                saveSettings(nextSettings);
                modeLabel.textContent = autoToggle.checked
                    ? 'Mode: auto-save to remembered folder'
                    : 'Mode: ask where to save each ZIP';
                showToast(autoToggle.checked ? 'Automatic save enabled' : 'Automatic save disabled', true);
            };

            resetFolderBtn.onclick = async () => {
                try {
                    await clearRememberedDirectoryHandle();
                    showToast('Remembered folder reset', true);
                } catch (e) {
                    showToast('Failed to reset folder', false);
                }
            };

            btn.onclick = async () => {
                btn.disabled = true;
                btn.textContent = '⏳ Working...';
                progressContainer.style.display = 'block';
                try {
                    await downloadCanvasAsZip(canvasId);
                    btn.textContent = autoToggle.checked ? '✅ ZIP Auto-Saved' : '✅ ZIP Saved';
                    btn.style.background = 'linear-gradient(135deg,#00c864,#00a854)';
                } catch (e) {
                    log('ZIP failed:', e);
                    showToast(e.message || 'ZIP failed', false);
                    btn.textContent = '❌ Error';
                    btn.style.background = 'linear-gradient(135deg,#ff4444,#cc0000)';
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = '📦 Download ZIP';
                        btn.style.background = 'linear-gradient(135deg,#e94560,#c73659)';
                    }, 3000);
                }
            };
        }
    }

    function isInsideOurUi(target) {
        if (!(target instanceof Element)) return false;
        return !!target.closest('#inzoi-fab, #inzoi-dl-panel');
    }

    function installGlobalUiEventGuard() {
        const swallow = (event) => {
            if (!isInsideOurUi(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        };

        // Block host app outside-click detection, but leave local click handling alive.
        ['pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach((type) => {
            window.addEventListener(type, swallow, true);
            document.addEventListener(type, swallow, true);
        });
    }

    function createFAB() {
        const existing = document.getElementById('inzoi-fab');
        if (existing) existing.remove();
        if (!isSupportedCreationUrl()) return;

        const fab = document.createElement('div');
        fab.id = 'inzoi-fab';
        fab.innerHTML = '📦';
        fab.title = 'Inzoi Canvas ZIP';
        fab.style.cssText = `
            position: fixed; bottom: 30px; right: 30px; z-index: 99998;
            width: 56px; height: 56px; border-radius: 50%; cursor: pointer;
            display:flex;align-items:center;justify-content:center;font-size:24px;
            background: linear-gradient(135deg,#e94560,#c73659); color:white;
            box-shadow: 0 8px 24px rgba(233,69,96,.45); user-select:none;
        `;
        fab.onmouseenter = () => fab.style.transform = 'scale(1.08)';
        fab.onmouseleave = () => fab.style.transform = 'scale(1)';

        const swallowFabPressEvent = (event) => {
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        };

        ['pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach((type) => {
            fab.addEventListener(type, swallowFabPressEvent, true);
        });

        fab.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
            const current = document.getElementById('inzoi-dl-panel');
            if (current) current.remove(); else createPanel();
        });

        document.body.appendChild(fab);
    }

    function syncUiForCurrentRoute() {
        const supported = isSupportedCreationUrl();
        const fab = document.getElementById('inzoi-fab');
        const panelEl = document.getElementById('inzoi-dl-panel');

        if (supported) {
            if (!fab) createFAB();
        } else {
            if (fab) fab.remove();
            if (panelEl) panelEl.remove();
        }
    }

    function installSpaRouteWatcher() {
        let lastHref = location.href;

        const handleRouteChange = () => {
            if (location.href === lastHref) return;
            lastHref = location.href;
            log('Route changed:', location.href);
            setTimeout(syncUiForCurrentRoute, 50);
        };

        const originalPushState = history.pushState;
        history.pushState = function (...args) {
            const result = originalPushState.apply(this, args);
            handleRouteChange();
            return result;
        };

        const originalReplaceState = history.replaceState;
        history.replaceState = function (...args) {
            const result = originalReplaceState.apply(this, args);
            handleRouteChange();
            return result;
        };

        window.addEventListener('popstate', () => handleRouteChange());
        window.addEventListener('hashchange', () => handleRouteChange());

        const observer = new MutationObserver(() => {
            if (location.href !== lastHref) handleRouteChange();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            installGlobalUiEventGuard();
            createFAB();
            installSpaRouteWatcher();
        });
    } else {
        installGlobalUiEventGuard();
        createFAB();
        installSpaRouteWatcher();
    }

    log('Inzoi Canvas Downloader v0.7 loaded');
})();