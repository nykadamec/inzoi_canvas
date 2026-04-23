// canvasDownloader.js
// Pomocné funkce — service worker obstarává vlastní fetch
// Tento modul obsahuje jen helpery pro parsování

/**
 * @param {Blob} blob
 * @returns {Promise<object|null>}
 */
async function blobToJson(blob) {
  try {
    var text = await blob.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}
