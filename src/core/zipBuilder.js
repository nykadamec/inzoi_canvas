// zipBuilder.js
// Vytváří ZIP archiv s JSZip 3.9.1 — přímá adaptace z userscriptu

var ZIP_COMPRESSION = 'STORE'; // 'DEFLATE' for smaller, 'STORE' for speed

/**
 * @param {Array<{path: string, blob: Blob}>} files
 * @param {string} zipRootPath — např. "Creations/MyFurniture/gal-xxx"
 * @param {Function} [onProgress]
 * @returns {Promise<Blob>}
 */
async function buildZip(files, zipRootPath, onProgress) {
  var zip = new JSZip();
  var root = zip.folder(zipRootPath);

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    root.file(file.path, file.blob);
    if (i % 4 === 0) {
      await new Promise(function(resolve) { setTimeout(resolve, 0); });
    }
  }

  if (onProgress) onProgress('Generating ZIP... 0%', 75);

  var startedAt = Date.now();
  var zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: ZIP_COMPRESSION,
      streamFiles: true,
    },
    function(metadata) {
      var pct = Math.max(75, Math.min(99, Math.round(75 + metadata.percent * 0.24)));
      if (onProgress) onProgress('Generating ZIP... ' + metadata.percent.toFixed(0) + '%', pct);
    }
  );

  console.log('[InzoiCanvas:zip] Generated in', Date.now() - startedAt, 'ms');
  return zipBlob;
}
