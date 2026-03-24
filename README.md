# SkTonline Stremio Addon

Port Kodi addonu `plugin.video.sktonline` do formatu Stremio addonu.

## Co uz funguje

- katalog videi z `online.sktorrent.eu`
- hladanie
- nacitanie streamov z `<video><source>` na detail stranke

## Spustenie

1. Otvor terminal v `v roote repozitara`
2. Nainstaluj zavislosti:

```bash
npm install
```

3. Spusti addon:

```bash
npm start
```

4. V Stremio otvor:

`http://127.0.0.1:7000/manifest.json`

## Premenovanie (aby sedelo s tvojim addon setupom)

Nazov/ID nemusis menit v kode, staci cez premenne prostredia:

- `ADDON_ID` (napr. `com.tvojeid.stremio`)
- `ADDON_NAME` (napr. `Moj Addon`)
- `ADDON_VERSION` (napr. `1.0.0`)
- `CATALOG_ID` (napr. `moj_catalog`)
- `CATALOG_NAME` (napr. `Moj Katalog`)

Priklad lokalneho spustenia v PowerShell:

```powershell
$env:ADDON_ID="com.tvojeid.stremio"
$env:ADDON_NAME="Moj Addon"
npm start
```

## GitHub + Render nasadenie

V projekte je pripraveny `render.yaml`, takze:

1. pushni tento adresar do GitHub repo
2. na Render vytvor novy Web Service z tohto repo
3. Render nacita `render.yaml` a nasadi `npm install` + `npm start`
4. po deploy otvor vo Stremio:

`https://tvoj-render-service.onrender.com/manifest.json`

Kompatibilita s povodnym repo stylom:

- entrypoint je `online-sktorrent-addon.js`
- `npm start` spusta tento subor (ako v starsich Stremio repo fork-och)

## Poznamky

- Ak sa zmeni HTML webu, parser bude treba upravit.
- Addon je neoficialny.
