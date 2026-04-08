# Inzoi Canvas Downloader — Mod Dependencies UI Feature

**Datum:** 2026-04-08
**Typ:** Feature addition — Mod Dependencies Panel
**Stav:** Draft

---

## 1. Cíl

Přidat do panelu (📦 Inzoi Canvas ZIP) **collapsible sekci** s přehledem required mods, které canvas potřebuje. Data se načítají z `meta.json` → `ModInformation[]` a doplňují přes CurseForge API.

---

## 2. UX Flow

1. Uživatel otevře panel (klik na FAB 📦)
2. Sekce "🎯 Required mods (N)" je **collapsed** (▶) — žádné API cally
3. Uživatel klikne na header sekce → rozbalí se ▼
4. Načtou se data z CurseForge API (přes background service worker)
5. Pro každý mod se zobrazí: název, autor, status (⏳/✅/❌)
6. Sekce zůstává cachovaná v paměti (ne při každém rozbalení)
7. **[×]** zavře sekci, data zůstanou cachovaná

---

## 3. Data Source

### Vstup: `meta.json` (hlavní, na úrovni canvasu)
```json
{
  "ModInformation": [
    { "ugc_id": 1504647, "author": "POGPUNG" },
    { "ugc_id": 1397164, "author": "Dreamdoll" }
  ]
}
```

### Zpracování: CurseForge API
```
GET https://api.curseforge.com/v1/mods/{ugc_id}
Header: x-api-key: $2a$10$dcQ6ahjTz05GGWgZbr7zeuCRycH/0yj1O5SIlLDlHVzGSXXJIM70C
```

Response relevantní pole:
- `data.name` — jméno modu
- `data.summary` — popis (volitelně)
- HTTP status 200 → ✅, 404 → ❌, síťová chyba → ❌

---

## 4. UI Design

### Collapsed (▶)
```html
<div style="padding:12px;border-radius:8px;margin-top:12px;
     background:rgba(255,255,255,.05);
     border:1px solid rgba(255,255,255,.06);
     cursor:pointer;user-select:none;" id="inzoi-mods-header">
  <span>🎯 Required mods (5)</span>
  <span style="float:right;color:#888;">▶</span>
</div>
```

### Expanded (▼)
```html
<div style="padding:12px;border-radius:8px;margin-top:12px;
     background:rgba(255,255,255,.05);
     border:1px solid rgba(255,255,255,.06);">
  <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
    <span>🎯 Required mods (5)</span>
    <button id="inzoi-mods-close" style="...">×</button>
  </div>
  <table style="width:100%;font-size:12px;border-collapse:collapse;">
    <tr style="color:#888;">
      <th style="padding:4px 8px;">#</th>
      <th style="padding:4px 8px;">Name</th>
      <th style="padding:4px 8px;">Author</th>
      <th style="padding:4px 8px;text-align:center;">Status</th>
    </tr>
    <tr>
      <td style="padding:4px 8px;">1</td>
      <td style="padding:4px 8px;">??? / "Coquette Tweed..."</td>
      <td style="padding:4px 8px;color:#888;">POGPUNG</td>
      <td style="padding:4px 8px;text-align:center;">⏳ / ✅ / ❌</td>
    </tr>
  </table>
</div>
```

### Font & barvy — sedí přesně k existujícímu panelu
- `font: 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`
- `color: #eee` (text), `#888` (label), `#60a5fa` (highlight)
- Status: ⏳ loading, ✅ ok, ❌ unavailable

---

## 5. Architektura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  panel.js       │────▶│  index.js        │────▶│  service-worker │
│  (UI render)    │◀────│  (state/cache)   │◀────│  (CF API call)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Nové moduly / změny

| Soubor | Změna |
|--------|-------|
| `panel.js` | Přidat `inzoi-mods-section` do HTML; render mods tabulky |
| `index.js` | State pro `modsCache`; handler pro expand/collapse; volá `fetchModInfo` |
| `service-worker.js` | Nový message handler `FETCH_MOD_INFO` → CurseForge API |

### API message flow
```js
// index.js → service-worker
chrome.runtime.sendMessage({
  type: 'FETCH_MOD_INFO',
  mods: [{ ugc_id: 1504647, author: 'POGPUNG' }, ...]
});

// service-worker → index.js
{
  ok: true,
  results: [
    { ugc_id: 1504647, name: 'Coquette Tweed Pink', status: 'ok' },
    { ugc_id: 1397164, name: null, status: 'not_found' }
  ]
}
```

---

## 6. Caching

- `modsCache` — objekt v `index.js` closure (paměť)
- Klíč: `canvasId`
- Value: `{ loaded: boolean, expanded: boolean, mods: [...] }`
- Sekce se nenačítá znova při opakovaném rozbalení
- Cache se maže při `removePanel()` (clean close)

---

## 7. Error handling

| Situace | Chování |
|---------|---------|
| `ModInformation` chybí v meta.json | Sekce se nezobrazí vůbec |
| `ModInformation` je prázdné pole | Sekce se nezobrazí |
| CurseForge API timeout | Zobrazí se ❌ s hláškou |
| Mod nenalezen (404) | Zobrazí se ❌ — "N/A" |
| Rate limit | Postupné cally s malým delay |

---

## 8. Definition of Done

- [ ] Sekce "🎯 Required mods (N)" je collapsed při otevření panelu
- [ ] Rozbalení na kliknutí funguje
- [ ] Tabulka zobrazí všechny mody z `ModInformation`
- [ ] Každý mod má jméno (z CF API) + autora + status
- [ ] ✅ / ❌ / ⏳ se správně zobrazuje
- [ ] API cally jdou přes background service worker (klíč není v content scriptu)
- [ ] Sekce sedí stylově k existujícímu panelu
- [ ] Cache funguje — opakované rozbalení nespustí nové API cally
- [ ] Zavření sekce ([×]) funguje
