// directoryHandleStore.js
// Directory handle persistence přes IndexedDB (pro auto-save funkci)

var IDB_NAME = 'inzoiCanvasDownloaderDB';
var IDB_STORE = 'handles';
var AUTO_SAVE_DIR_KEY = 'autoSaveDirectoryHandle';

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = function() {
      var db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

/**
 * @param {string} key
 * @returns {Promise<any>}
 */
function idbGet(key) {
  return new Promise(function(resolve, reject) {
    openDb().then(function(db) {
      var tx = db.transaction(IDB_STORE, 'readonly');
      var req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    }).catch(reject);
  });
}

/**
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
function idbSet(key, value) {
  return new Promise(function(resolve, reject) {
    openDb().then(function(db) {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      var req = tx.objectStore(IDB_STORE).put(value, key);
      req.onsuccess = function() { resolve(); };
      req.onerror = function() { reject(req.error); };
    }).catch(reject);
  });
}

/**
 * @param {string} key
 * @returns {Promise<void>}
 */
function idbDelete(key) {
  return new Promise(function(resolve, reject) {
    openDb().then(function(db) {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      var req = tx.objectStore(IDB_STORE).delete(key);
      req.onsuccess = function() { resolve(); };
      req.onerror = function() { reject(req.error); };
    }).catch(reject);
  });
}

/**
 * @param {any} handle
 * @param {boolean} request
 * @returns {Promise<boolean>}
 */
async function ensureHandlePermission(handle, request) {
  if (!handle) return false;
  var opts = { mode: 'readwrite' };
  try {
    if (await handle.queryPermission(opts) === 'granted') return true;
    if (request && await handle.requestPermission(opts) === 'granted') return true;
  } catch (e) {
    console.warn('[InzoiCanvas] Handle permission error:', e);
  }
  return false;
}

/**
 * @param {boolean} request — zkusit požádat o permission pokud není
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function getRememberedDirectoryHandle(request) {
  try {
    var handle = await idbGet(AUTO_SAVE_DIR_KEY);
    if (!handle) return null;
    var ok = await ensureHandlePermission(handle, request);
    if (!ok) {
      await idbDelete(AUTO_SAVE_DIR_KEY);
      return null;
    }
    return handle;
  } catch (e) {
    console.warn('[InzoiCanvas] Failed to load remembered dir handle:', e);
    return null;
  }
}

/**
 * @param {FileSystemDirectoryHandle} handle
 */
async function rememberDirectoryHandle(handle) {
  await idbSet(AUTO_SAVE_DIR_KEY, handle);
}

/**
 * Smaže uložený directory handle
 */
async function clearRememberedDirectoryHandle() {
  await idbDelete(AUTO_SAVE_DIR_KEY);
}
