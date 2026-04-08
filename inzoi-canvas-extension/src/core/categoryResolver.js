// categoryResolver.js
// Určuje Category/Subcategory pro ZIP strukturu

/**
 * @param {string} canvasUrl — window.location.href
 * @param {object|null} metaData — parsovaný meta.json blob (volitelný)
 * @returns {{ category: string, subcategory: string }}
 */
function determineCategoryAndSubcategory(canvasUrl, metaData) {
  if (metaData === undefined || metaData === null) metaData = null;

  var category = 'Creations';
  var subcategory = 'General';

  var lowerUrl = (canvasUrl || '').toLowerCase();

  // 1) URL-based category
  if (lowerUrl.indexOf('/aigenerated/') !== -1 || lowerUrl.indexOf('/ai-generated/') !== -1) {
    category = 'AIGenerated';
  } else if (lowerUrl.indexOf('/canvas/') !== -1) {
    category = 'Canvas';
  } else if (lowerUrl.indexOf('/creation/') !== -1 || lowerUrl.indexOf('/creations/') !== -1) {
    category = 'Creations';
  }

  // 2) metaData overrides
  if (metaData && typeof metaData === 'object') {
    var contentType = metaData.type || metaData.Type || metaData.category || metaData.Category || '';
    if (contentType) {
      var ct = String(contentType).toLowerCase();
      if (ct.indexOf('ai') !== -1 || ct.indexOf('generated') !== -1)       category = 'AIGenerated';
      else if (ct.indexOf('canvas') !== -1)                                 category = 'Canvas';
      else if (ct.indexOf('creation') !== -1)                                category = 'Creations';
    }

    var tags = metaData.tags || metaData.Tags || [];
    var systemTags = metaData.SystemTags || metaData.systemTags || [];

    if (Array.isArray(tags) && tags.length) {
      var ts = tags.join(' ').toLowerCase();
      if (ts.indexOf('ai') !== -1 || ts.indexOf('generated') !== -1)      category = 'AIGenerated';
      else if (ts.indexOf('canvas') !== -1)                                  category = 'Canvas';
      else if (ts.indexOf('creation') !== -1)                                 category = 'Creations';
    }

    // SubCategory field (nejvyšší priorita)
    if ('SubCategory' in metaData) {
      subcategory = resolveSubCategory(metaData.SubCategory, category);
    } else if (Array.isArray(systemTags) && systemTags.length) {
      var sts = systemTags.join(' ').toLowerCase();
      if (sts.indexOf('texture') !== -1 || sts.indexOf('importedtexture') !== -1) {
        subcategory = 'MyTextures'; category = 'Creations';
      } else if (sts.indexOf('appearance') !== -1) {
        subcategory = 'MyAppearances'; category = 'Canvas';
      } else if (sts.indexOf('character') !== -1) {
        subcategory = 'MyCharacters'; category = 'Canvas';
      } else if (sts.indexOf('face') !== -1) {
        subcategory = 'MyFaces'; category = 'Canvas';
      } else if (sts.indexOf('clothes') !== -1 || sts.indexOf('outfit') !== -1) {
        subcategory = 'MyClothes'; category = 'Canvas';
      } else if (sts.indexOf('house') !== -1 || sts.indexOf('property') !== -1) {
        subcategory = 'MyHouses'; category = 'Canvas';
      } else if (sts.indexOf('room') !== -1) {
        subcategory = 'MyRooms'; category = 'Canvas';
      } else if (sts.indexOf('furniture') !== -1 || sts.indexOf('craft') !== -1) {
        subcategory = 'MyFurniture'; category = 'Canvas';
      }
    } else if ('Configuration' in metaData) {
      var cfg = String(metaData.Configuration).toLowerCase();
      if (['garmentpreset', 'headpreset', 'makeuppreset', 'stylingpreset'].indexOf(cfg) !== -1) {
        subcategory = 'MyAppearances'; category = 'Canvas';
      } else if (cfg === 'character') {
        subcategory = 'MyCharacters'; category = 'Canvas';
      }
    }
  }

  return { category: category, subcategory: subcategory };
}

function resolveSubCategory(subCat, currentCategory) {
  var map = {
    ImportedTexture: { sub: 'MyTextures',   cat: 'Creations' },
    Appearance:      { sub: 'MyAppearances', cat: 'Canvas' },
    Character:       { sub: 'MyCharacters',  cat: 'Canvas' },
    Face:            { sub: 'MyFaces',       cat: 'Canvas' },
    Clothes:         { sub: 'MyClothes',     cat: 'Canvas' },
    Outfit:          { sub: 'MyClothes',     cat: 'Canvas' },
    House:           { sub: 'MyHouses',      cat: 'Canvas' },
    Property:        { sub: 'MyHouses',      cat: 'Canvas' },
    Room:            { sub: 'MyRooms',        cat: 'Canvas' },
    Furniture:       { sub: 'MyFurniture',   cat: 'Canvas' },
    Craft:           { sub: 'MyFurniture',   cat: 'Canvas' },
  };

  var entry = map[subCat];
  if (!entry) return currentCategory === 'Canvas' ? 'MyAppearances' : 'General';
  return entry.sub;
}
