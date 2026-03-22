// online-sktorrent-addon.js
// Note: Use Node.js v20.09 LTS for testing (https://nodejs.org/en/blog/release/v20.9.0)
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const { decode } = require("entities");

const builder = addonBuilder({
    id: "org.stremio.sktonline",
    version: "1.0.0",
    name: "SKTonline Online Streams",
    description: "Priame online videá (720p/480p/360p) z online.sktorrent.eu",
    types: ["movie", "series"],
    catalogs: [
        { type: "movie", id: "sktonline-movie", name: "SKTonline Filmy" },
        { type: "series", id: "sktonline-series", name: "SKTonline Seriály" }
    ],
    resources: ["stream"],
    idPrefixes: ["tt"]
});

const commonHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36',
    'Accept-Encoding': 'identity'
};

function removeDiacritics(str) {
    return str.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function shortenTitle(title, wordCount = 3) {
    return title.split(/\s+/).slice(0, wordCount).join(" ");
}

function extractFlags(title) {
    const flags = [];
    if (/\bCZ\b/i.test(title)) flags.push("cz");
    if (/\bSK\b/i.test(title)) flags.push("sk");
    if (/\bEN\b/i.test(title)) flags.push("en");
    if (/\bHU\b/i.test(title)) flags.push("hu");
    if (/\bDE\b/i.test(title)) flags.push("de");
    if (/\bFR\b/i.test(title)) flags.push("fr");
    if (/\bIT\b/i.test(title)) flags.push("it");
    if (/\bES\b/i.test(title)) flags.push("es");
    if (/\bRU\b/i.test(title)) flags.push("ru");
    if (/\bPL\b/i.test(title)) flags.push("pl");
    if (/\bJP\b/i.test(title)) flags.push("jp");
    if (/\bCN\b/i.test(title)) flags.push("cn");
    return flags;
}

function formatTitle(label) {
    const qualityIcon = /720p|HD/i.test(label) ? "🟦 HD (720p)" :
                        /480p|SD/i.test(label) ? "🟨 SD (480p)" :
                        /360p|LD/i.test(label) ? "🟥 LD (360p)" : label;
    return `SKTonline ${qualityIcon}`;
}

function formatName(fullTitle, flagsArray) {
    const flagIcons = {
        cz: "🇨🇿", sk: "🇸🇰", en: "🇬🇧", hu: "🇭🇺", de: "🇩🇪", fr: "🇫🇷",
        it: "🇮🇹", es: "🇪🇸", ru: "🇷🇺", pl: "🇵🇱", jp: "🇯🇵", cn: "🇨🇳"
    };
    const iconStr = flagsArray.map(f => flagIcons[f]).filter(Boolean).join(" ");
    return fullTitle + "\n⚙️SKTonline" + (iconStr ? "\n" + iconStr : "");
}

async function getTitleFromIMDb(type, imdbId) {
  try {
    const url = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
    console.log(`[DEBUG] 🌐 Cinemeta Request: ${url}`);
    const res = await axios.get(url, { headers: commonHeaders, timeout: 12000 });
    const meta = res?.data?.meta || {};
    const title = (meta.name || meta.title || "").trim();
    const originalTitle = (meta.originalTitle || title || "").trim();
    if (!title) {
      console.error("[ERROR] Cinemeta nenašla názov");
      return null;
    }
    console.log(`[DEBUG] 🎬 Cinemeta title: ${title}, original: ${originalTitle}`);
    return { title, originalTitle };
  } catch (err) {
    console.error("[ERROR] Cinemeta zlyhala:", err.message);
    return null;
  }
}

async function searchOnlineVideos(query) {
  // 1) Skúsime niekoľko možných vyhľadávacích ciest
  const candidates = [
    `${BASE}/search/videos?search_query=${encodeURIComponent(query)}`,
    `${BASE}/search?q=${encodeURIComponent(query)}`,
    `${BASE}/?s=${encodeURIComponent(query)}`
  ];

  const headers = {
    ...commonHeaders,
    Referer: BASE + "/",
    "Accept-Language": "sk,cs;q=0.9,en;q=0.8"
  };

  // Pomocná funkcia: zo stránky vytiahne ID videí rôznymi spôsobmi
  const extractIds = (html) => {
    const ids = new Set();
    const $ = cheerio.load(html);

    // 1) Štandardné odkazy /video/12345
    $("a[href^='/video/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const m = href.match(/\/video\/(\d+)/);
      if (m) ids.add(m[1]);
    });

    // 2) Niekedy býva iná štruktúra – regex priamo nad HTML
    const re = /href=["']\/video\/(\d+)["']/g;
    let match;
    while ((match = re.exec(html)) !== null) {
      ids.add(match[1]);
    }

    // 3) Ak by stránka používala iný prefix (napr. /watch/123), pridaj ďalší regex:
    // const re2 = /href=["']\/watch\/(\d+)["']/g; while ((match = re2.exec(html)) !== null) ids.add(match[1]);

    return Array.from(ids);
  };

  // 2) Skúsime kandidátov, prvý, čo niečo nájde, vyhráva
  for (const url of candidates) {
    try {
      console.log(`[INFO] 🔍 Hľadám '${query}' na ${url}`);
      const res = await axios.get(url, { headers, timeout: 20000 });
      console.log(`[DEBUG] Status: ${res.status}`);
      const html = typeof res.data === "string" ? res.data : "";
      console.log(`[DEBUG] HTML length: ${html.length}`);

      if (html && html.length > 50) {
        const ids = extractIds(html);
        console.log(`[INFO] 📺 Nájdených videí: ${ids.length} (na ${url})`);
        if (ids.length > 0) return ids;
      }
    } catch (err) {
      console.error("[ERROR] ❌ Vyhľadávanie zlyhalo na", url, "→", err.message);
    }
  }

  // 3) Fallback: prehľadaj homepage / katalóg, ak vyhľadávanie nič nedalo
  try {
    console.log(`[INFO] 🏠 Fallback – prehľadávam homepage podľa '${query}'`);
    const home = await axios.get(`${BASE}/`, { headers, timeout: 20000 });
    const html = typeof home.data === "string" ? home.data : "";
    const $ = cheerio.load(html);

    // Nájdeme karty a z tých, ktoré menom približne sedia na query, vytiahneme /video/ID
    const ids = new Set();
    $(".card, .movie-card, .col, .col-md-3, a").each((_, el) => {
      const $el = $(el);
      const title =
        $el.find(".card-title").text().trim() ||
        $el.find("h5, h4, .title").first().text().trim() ||
        $el.attr("title") || "";
      const href = $el.attr("href") || $el.find("a").attr("href") || "";

      if (!href) return;

      // jemný match na názov (bez diakritiky, case-insensitive)
      const t = removeDiacritics((title || "").toLowerCase());
      const q = removeDiacritics(query.toLowerCase());
      if (t && (t === q || t.includes(q))) {
        const m = href.match(/\/video\/(\d+)/);
        if (m) ids.add(m[1]);
      }
    });

    const out = Array.from(ids);
    console.log(`[INFO] 📺 Fallback našiel videí: ${out.length}`);
    return out;
  } catch (err) {
    console.error("[ERROR] ❌ Fallback homepage zlyhal:", err.message);
    return [];
  }
}


async function extractStreamsFromVideoId(videoId) {
    const url = `https://online.sktorrent.eu/video/${videoId}`;
    console.log(`[DEBUG] 🔎 Načítavam detaily videa: ${url}`);
    try {
        const res = await axios.get(url, { headers: commonHeaders });
        console.log(`[DEBUG] Status: ${res.status}`);
        console.log(`[DEBUG] Detail HTML Snippet:`, res.data.slice(0, 300));

        const $ = cheerio.load(res.data);
        const sourceTags = $('video source');
        const titleText = $('title').text().trim();
        const flags = extractFlags(titleText);

        const streams = [];
        sourceTags.each((i, el) => {
            let src = $(el).attr('src');
            const label = $(el).attr('label') || 'Unknown';
            if (src && src.endsWith('.mp4')) {
                src = src.replace(/([^:])\/\/+/, '$1/');
                console.log(`[DEBUG] 🎞️ ${label} stream URL: ${src}`);
                streams.push({
                    title: formatName(titleText, flags),
                    name: formatTitle(label),
                    url: src
                });
            }
        });

        console.log(`[INFO] ✅ Našiel som ${streams.length} streamov pre videoId=${videoId}`);
        return streams;
    } catch (err) {
        console.error("[ERROR] ❌ Chyba pri načítaní detailu videa:", err.message);
        return [];
    }
}

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`\n====== 🎮 STREAM požiadavka: type='${type}', id='${id}' ======`);
    const [imdbId, seasonStr, episodeStr] = id.split(":");
    const season = seasonStr ? parseInt(seasonStr) : null;
    const episode = episodeStr ? parseInt(episodeStr) : null;

    const titles = await getTitleFromIMDb(type, imdbId);
    if (!titles) return { streams: [] };

    const { title, originalTitle } = titles;
    const queries = new Set();

    const baseTitles = [title, originalTitle].map(t => t.replace(/\(.*?\)/g, '').trim());
    for (const base of baseTitles) {
        const noDia = removeDiacritics(base);
        const short = shortenTitle(noDia);
        const short1 = shortenTitle(noDia, 1);

        if (type === 'series' && season && episode) {
            const epTag1 = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
            const epTag2 = `${season}x${episode}`;
            [base, noDia, short, short1].forEach(b => {
                queries.add(`${b} ${epTag1}`);
                queries.add(`${b} ${epTag2}`);
            });
        } else {
            [base, noDia, short].forEach(b => {
                queries.add(b);
            });
        }
    }

    let allStreams = [];
    let attempt = 1;
    for (const q of queries) {
        console.log(`[DEBUG] 🔍 Pokus ${attempt++}: '${q}'`);
        const videoIds = await searchOnlineVideos(q);
        for (const vid of videoIds) {
            const streams = await extractStreamsFromVideoId(vid);
            allStreams.push(...streams);
        }
        if (allStreams.length > 0) break;
    }

    console.log(`[INFO] 📤 Odosielam ${allStreams.length} streamov do Stremio`);
    return { streams: allStreams };
});


builder.defineCatalogHandler(async ({ type, id }) => {
  try {
    console.log(`[DEBUG] 📚 Katalóg požiadavka pre typ='${type}' id='${id}'`);
    // Dočasne prázdne – dôležité je, že vraciame Promise. Neskôr doplníme dáta.
    return { metas: [] };
  } catch (e) {
    console.error("Catalog handler error:", e?.message || e);
    return { metas: [] }; // nikdy nevracaj 500
  }
});


console.log("📦 Manifest:", builder.getInterface().manifest);
serveHTTP(builder.getInterface(), { port: 7000 });
console.log("🚀 SKTonline Online addon beží na http://localhost:7000/manifest.json");
