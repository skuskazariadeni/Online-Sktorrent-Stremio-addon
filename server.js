const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const BASE_DOMAIN = "online.sktorrent.eu";
const BASE_URL = `https://${BASE_DOMAIN}`;
const PORT = process.env.PORT || 7000;
const ADDON_ID = process.env.ADDON_ID || "com.skuskazariadeni.onlinesktorrent.stremio";
const ADDON_NAME = process.env.ADDON_NAME || "SKTonline Online Streams";
const ADDON_VERSION = process.env.ADDON_VERSION || "1.0.0";
const CATALOG_ID = process.env.CATALOG_ID || "online_sktorrent_catalog";
const CATALOG_NAME = process.env.CATALOG_NAME || "SKTonline Online Streams";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  Referer: BASE_URL,
  "Accept-Encoding": "identity"
};

const CATEGORIES = [
  { id: "videos", name: "Vsetko", path: "/videos" },
  { id: "dokumenty-cz-sk-dabing", name: "Dokumenty CZ/SK dabing", path: "/videos/dokumenty-cz-sk-dabing" },
  { id: "dokumenty-cz-sk-titulky", name: "Dokumenty CZ/SK titulky", path: "/videos/dokumenty-cz-sk-titulky" },
  { id: "filmy", name: "Filmy", path: "/videos/filmy" },
  { id: "filmy-cz-sk", name: "Filmy CZ/SK", path: "/videos/filmy-cz-sk" },
  { id: "filmy-cz-sk-titulky", name: "Filmy CZ/SK titulky", path: "/videos/filmy-cz-sk-titulky" },
  { id: "rozpravky", name: "Rozpravky", path: "/videos/rozpravky-cz-sk-kreslene-animovane" },
  { id: "hudba", name: "Hudba", path: "/videos/hudba" },
  { id: "ostatni", name: "Ostatne", path: "/videos/ostatni" },
  { id: "serialy-cz-sk", name: "Serialy CZ/SK", path: "/videos/serialy-cz-sk" },
  { id: "serialy-cz-sk-titulky", name: "Serialy CZ/SK titulky", path: "/videos/serialy-cz-sk-titulky" },
  { id: "trailery", name: "Trailery", path: "/videos/trailery" }
];

const SORTS = [
  { id: "bw", name: "Najlepsie", param: "o=bw" },
  { id: "mr", name: "Najnovsie", param: "o=mr" },
  { id: "mv", name: "Najviac zhliadnute", param: "o=mv" },
  { id: "md", name: "Najviac komentovane", param: "o=md" },
  { id: "tr", name: "Top hodnotene", param: "o=tr" },
  { id: "tf", name: "Top favority", param: "o=tf" },
  { id: "lg", name: "Posledne pridane", param: "o=lg" }
];

function encodeMetaId(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function decodeMetaId(id) {
  return JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
}

function categoryFromExtra(extra) {
  const chosen = extra?.genre || "videos";
  return CATEGORIES.find((c) => c.id === chosen) || CATEGORIES[0];
}

function sortFromExtra(extra) {
  const chosen = extra?.sort || "mr";
  return SORTS.find((s) => s.id === chosen) || SORTS[1];
}

function pageFromSkip(extra) {
  const skip = Number(extra?.skip || 0);
  if (!Number.isFinite(skip) || skip < 0) {
    return 1;
  }
  return Math.floor(skip / 30) + 1;
}

async function fetchHTML(url) {
  const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  return cheerio.load(response.data);
}

async function listCatalogItems(extra = {}) {
  const category = categoryFromExtra(extra);
  const sort = sortFromExtra(extra);
  const page = pageFromSkip(extra);
  const query = (extra.search || "").trim();

  let url;
  if (query) {
    url = `${BASE_URL}/search/videos?type=public&t=a&o=mr&search_query=${encodeURIComponent(query)}&page=${page}`;
  } else {
    url = `${BASE_URL}${category.path}?type=public&t=a&${sort.param}&page=${page}`;
  }

  const $ = await fetchHTML(url);
  const posts = $("div.well.well-sm").toArray();

  return posts
    .map((post) => {
      const node = $(post);
      const linkEl = node.find("a").first();
      const title = node.find("span").first().text().trim();
      const href = linkEl.attr("href");
      const rawPoster = node.find("img").first().attr("src") || "";

      if (!href || !title) {
        return null;
      }

      const poster = rawPoster.replace("1.jpg", "default.jpg");
      const id = encodeMetaId({ href, title, poster });

      return {
        id,
        type: "movie",
        name: title,
        poster,
        posterShape: "landscape"
      };
    })
    .filter(Boolean);
}

async function extractStreams(metaId) {
  const decoded = decodeMetaId(metaId);
  const href = decoded.href;
  if (!href) {
    return [];
  }

  const $ = await fetchHTML(`${BASE_URL}${href}`);
  const videoSources = $("video#video source").toArray();

  return videoSources
    .map((source) => {
      const s = $(source);
      const src = s.attr("src");
      const label = s.attr("label") || "Unknown quality";
      if (!src) {
        return null;
      }

      return {
        title: `SkTonline ${label}`,
        url: src
      };
    })
    .filter(Boolean);
}

const manifest = {
  id: ADDON_ID,
  version: ADDON_VERSION,
  name: ADDON_NAME,
  description: "Port Kodi addonu plugin.video.sktonline pre Stremio",
  resources: ["catalog", "meta", "stream"],
  types: ["movie"],
  idPrefixes: [""],
  catalogs: [
    {
      type: "movie",
      id: CATALOG_ID,
      name: CATALOG_NAME,
      extra: [
        { name: "search", isRequired: false },
        { name: "genre", options: CATEGORIES.map((c) => c.id), isRequired: false },
        { name: "sort", options: SORTS.map((s) => s.id), isRequired: false },
        { name: "skip", isRequired: false }
      ]
    }
  ],
  behaviorHints: {
    configurable: false
  }
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ extra }) => {
  try {
    const metas = await listCatalogItems(extra || {});
    return { metas };
  } catch (error) {
    console.error("Catalog error:", error.message);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ id }) => {
  try {
    const decoded = decodeMetaId(id);
    return {
      meta: {
        id,
        type: "movie",
        name: decoded.title || "SkTonline",
        poster: decoded.poster || undefined
      }
    };
  } catch (error) {
    return { meta: null };
  }
});

builder.defineStreamHandler(async ({ id }) => {
  try {
    const streams = await extractStreams(id);
    return { streams };
  } catch (error) {
    console.error("Stream error:", error.message);
    return { streams: [] };
  }
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(`${ADDON_NAME} running on http://127.0.0.1:${PORT}/manifest.json`);
