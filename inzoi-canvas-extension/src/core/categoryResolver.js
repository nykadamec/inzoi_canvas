// categoryResolver.js
// Určuje Category/Subcategory pro ZIP strukturu
// Podle CANVAS_API_STRUCTURE.md — vždy začíná "Canvas/"

/**
 * @param {string} canvasUrl — window.location.href
 * @param {object|null} metaData — parsovaný meta.json (volitelný)
 * @returns {{ category: string, subcategory: string, topCategory: string }}
 *   topCategory = vždy "Canvas"
 *   category = hlavní složka (MyTextures, MyFurnitures, ...)
 *   subcategory = podsložka pokud existuje, jinak stejná jako category
 */
function determineCategoryAndSubcategory(canvasUrl, metaData) {
  var topCategory = 'Canvas';

  // Implicitní: Creations / General
  var category = 'Creations';
  var subcategory = 'General';

  var lowerUrl = (canvasUrl || '').toLowerCase();

  // URL-based overrides (nízká priorita)
  if (lowerUrl.indexOf('/aigenerated/') !== -1 || lowerUrl.indexOf('/ai-generated/') !== -1) {
    category = 'AIGenerated';
    subcategory = 'AIGenerated';
  } else if (lowerUrl.indexOf('/canvas/') !== -1) {
    category = 'Creations';
    subcategory = 'General';
  } else if (lowerUrl.indexOf('/creation/') !== -1 || lowerUrl.indexOf('/creations/') !== -1) {
    category = 'Creations';
    subcategory = 'General';
  }

  // metaData overrides (nejvyšší priorita)
  if (metaData && typeof metaData === 'object') {
    // 1) SubCategory field — hlavní rozhodovací bod
    if ('SubCategory' in metaData) {
      var result = resolveBySubCategory(metaData.SubCategory, metaData);
      category = result.category;
      subcategory = result.subcategory;

    // 2) SystemTags — druhá úroveň specificity
    } else {
      var systemTags = metaData.SystemTags || metaData.systemTags || [];
      var tags = metaData.tags || metaData.Tags || [];

      if (Array.isArray(systemTags) && systemTags.length) {
        var result2 = resolveBySystemTags(systemTags, metaData);
        if (result2) {
          category = result2.category;
          subcategory = result2.subcategory;
        }
      }

      // 3) Configuration field
      if (subcategory === 'General' && 'Configuration' in metaData) {
        var result3 = resolveByConfiguration(metaData.Configuration);
        if (result3) {
          category = result3.category;
          subcategory = result3.subcategory;
        }
      }

      // 4) Tags fallback
      if (subcategory === 'General' && Array.isArray(tags) && tags.length) {
        var tagsStr = tags.join(' ').toLowerCase();
        if (tagsStr.indexOf('ai') !== -1 || tagsStr.indexOf('generated') !== -1) {
          category = 'AIGenerated';
          subcategory = 'AIGenerated';
        } else if (tagsStr.indexOf('texture')) {
          category = 'MyTextures';
          subcategory = 'MyTextures';
        } else if (tagsStr.indexOf('furniture')) {
          category = 'MyFurnitures';
          subcategory = 'MyFurnitures';
        }
      }
    }
  }

  // Pokud category == subcategory, zduplikuj — struktura pak je "Canvas/MyTextures/MyTextures/"
  // Ale podle CANVAS_API_STRUCTURE.md to tak je správně pro jednoplatné kategorie
  return { topCategory: topCategory, category: category, subcategory: subcategory };
}

/**
 * @param {string} subCat
 * @param {object} metaData
 */
function resolveBySubCategory(subCat, metaData) {
  var map = {
    // Textures
    ImportedTexture:  { category: 'MyTextures',   subcategory: 'MyTextures' },
    Texture:           { category: 'MyTextures',   subcategory: 'MyTextures' },

    // Furniture
    Furniture:         { category: 'MyFurnitures', subcategory: 'MyFurnitures' },
    Craft:              { category: 'MyFurnitures', subcategory: 'MyFurnitures' },

    // Rooms
    Room:              { category: 'MyRooms',      subcategory: 'MyRooms' },
    BedRoom:           { category: 'MyRooms',       subcategory: 'BedRoom' },

    // Sites / Houses
    House:             { category: 'MySites',      subcategory: 'MySites' },
    Property:           { category: 'MySites',       subcategory: 'MySites' },
    Lot:                { category: 'MySites',      subcategory: 'Lot' },
    LotStudio:         { category: 'Creations',     subcategory: 'LotStudio' },
    Architecture:     { category: 'MySites',       subcategory: 'Architecture' },

    // Appearances / Characters
    Appearance:        { category: 'MyAppearances', subcategory: 'MyAppearances' },
    Character:         { category: 'MyAppearances',  subcategory: 'MyCharacters' },
    Face:              { category: 'MyAppearances',  subcategory: 'MyFaces' },
    GarmentPreset:    { category: 'MyAppearances',  subcategory: 'GarmentPreset' },
    Preset:            { category: 'MyAppearances',  subcategory: 'Preset' },

    // 3D Printer
    Hobby:             { category: 'My3DPrinter',   subcategory: 'Hobby' },

    // Outfits / Clothes
    Clothes:           { category: 'MyAppearances',  subcategory: 'MyClothes' },
    Outfit:            { category: 'MyAppearances',  subcategory: 'MyClothes' },

    // Materials
    Material:          { category: 'MyMaterials',   subcategory: 'MyMaterials' },

    // Image to 3D
    ImageTo3D:         { category: 'ImageTo3D',     subcategory: 'ImageTo3D' },
  };

  var entry = map[subCat];
  if (entry) return entry;

  // Default pro neznámé
  return { category: 'Creations', subcategory: 'General' };
}

/**
 * @param {string[]} systemTags
 * @param {object} metaData
 */
function resolveBySystemTags(systemTags, metaData) {
  var str = (Array.isArray(systemTags) ? systemTags.join(' ') : String(systemTags)).toLowerCase();

  if (str.indexOf('texture') !== -1 || str.indexOf('importedtexture') !== -1) {
    return { category: 'MyTextures', subcategory: 'MyTextures' };
  }
  if (str.indexOf('furniture') !== -1 || str.indexOf('craft') !== -1) {
    return { category: 'MyFurnitures', subcategory: 'MyFurnitures' };
  }
  if (str.indexOf('room') !== -1) {
    if (str.indexOf('bedroom') !== -1) {
      return { category: 'MyRooms', subcategory: 'BedRoom' };
    }
    return { category: 'MyRooms', subcategory: 'MyRooms' };
  }
  if (str.indexOf('house') !== -1 || str.indexOf('property') !== -1) {
    if (str.indexOf('lot') !== -1) {
      return { category: 'MySites', subcategory: 'Lot' };
    }
    if (str.indexOf('architecture') !== -1) {
      return { category: 'MySites', subcategory: 'Architecture' };
    }
    if (str.indexOf('studio') !== -1 || str.indexOf('lotstudio') !== -1) {
      return { category: 'Creations', subcategory: 'LotStudio' };
    }
    return { category: 'MySites', subcategory: 'MySites' };
  }
  if (str.indexOf('appearance') !== -1) {
    if (str.indexOf('clothes') !== -1 || str.indexOf('outfit') !== -1) {
      return { category: 'MyAppearances', subcategory: 'MyClothes' };
    }
    if (str.indexOf('face') !== -1) {
      return { category: 'MyAppearances', subcategory: 'MyFaces' };
    }
    if (str.indexOf('garment') !== -1) {
      return { category: 'MyAppearances', subcategory: 'GarmentPreset' };
    }
    return { category: 'MyAppearances', subcategory: 'MyAppearances' };
  }
  if (str.indexOf('character') !== -1) {
    return { category: 'MyAppearances', subcategory: 'MyCharacters' };
  }
  if (str.indexOf('material') !== -1) {
    return { category: 'MyMaterials', subcategory: 'MyMaterials' };
  }
  if (str.indexOf('hobby') !== -1 || str.indexOf('print') !== -1 || str.indexOf('3dprint') !== -1) {
    return { category: 'My3DPrinter', subcategory: 'Hobby' };
  }
  if (str.indexOf('ai') !== -1 || str.indexOf('generated') !== -1 || str.indexOf('aigenerated') !== -1) {
    return { category: 'AIGenerated', subcategory: 'AIGenerated' };
  }
  if (str.indexOf('image2d3d') !== -1 || str.indexOf('imagetyped') !== -1) {
    return { category: 'ImageTo3D', subcategory: 'ImageTo3D' };
  }
  if (str.indexOf('creation') !== -1) {
    if (str.indexOf('lotstudio') !== -1 || str.indexOf('lot') !== -1 && str.indexOf('studio') !== -1) {
      return { category: 'Creations', subcategory: 'LotStudio' };
    }
    return { category: 'Creations', subcategory: 'General' };
  }

  return null;
}

/**
 * @param {string} config
 */
function resolveByConfiguration(config) {
  var cfg = String(config).toLowerCase();
  var presetMap = {
    garmentpreset:  { category: 'MyAppearances', subcategory: 'GarmentPreset' },
    headpreset:     { category: 'MyAppearances', subcategory: 'GarmentPreset' },
    makeuppreset:   { category: 'MyAppearances', subcategory: 'GarmentPreset' },
    stylingpreset:  { category: 'MyAppearances', subcategory: 'GarmentPreset' },
    character:      { category: 'MyAppearances', subcategory: 'MyCharacters' },
    lot:            { category: 'MySites',      subcategory: 'Lot' },
    room:           { category: 'MyRooms',      subcategory: 'MyRooms' },
    furniture:      { category: 'MyFurnitures', subcategory: 'MyFurnitures' },
  };
  return presetMap[cfg] || null;
}
