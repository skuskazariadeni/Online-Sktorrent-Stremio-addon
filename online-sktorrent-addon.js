const axios = require("axios");
const cheerio = require("cheerio");
const express = require("express");
const app = express();

const manifest = {
    id: "sktorrent-online-addon",
    version: "1.0.1",
    name: "SKTorrent Online",
    description: "Streamy z online.sktorrent.eu",
    types: ["movie"],
    catalogs: [
        {
            type: "movie",
            id: "sktonline",
            name: "SKTonline Filmy"
        }
    ],
    resources: ["catalog", "stream"]
};

// -------------------------
// PARSOVANIE ZOZNAMU FILMOV
// -------------------------
async function fetchMovies() {
    const url = "https://online.sktorrent.eu/";

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const items = [];

    $(".card").each((i, el) => {
        const title = $(el).find(".card-title").text().trim();
        const link = $(el).find("a").attr("href");
        const poster = $(el).find("img.card-img-top").attr("src");

        if (!title || !link) return;

        items.push({
            id: link,
            name: title,
            poster: poster ? poster : "",
            type: "movie"
        });
    });

    return items;
}

// -------------------------
// PARSOVANIE DETAILU FILMU
// -------------------------
async function fetchStream(id) {
    const url = id.startsWith("http") ? id : `https://online.sktorrent.eu${id}`;

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Na stránke je MP4 link v tlačidle .btn-primary
    const videoUrl = $("a.btn-primary").attr("href");

    if (!videoUrl) return [];

    return [
        {
            name: "SKTorrent Online",
            type: "movie",
            url: videoUrl
        }
    ];
}

// -------------------------
// API ENDPOINTY PRE STREMIO
// -------------------------
app.get("/manifest.json", (req, res) => {
    res.json(manifest);
});

app.get("/catalog/:type/:id.json", async (req, res) => {
    try {
        const movies = await fetchMovies();
        res.json({ metas: movies });
    } catch (err) {
        console.error("Catalog error:", err);
        res.json({ metas: [] });
    }
});

app.get("/stream/:type/:id.json", async (req, res) => {
    try {
        const id = decodeURIComponent(req.params.id);
        const streams = await fetchStream(id);
        res.json({ streams });
    } catch (err) {
        console.error("Stream error:", err);
        res.json({ streams: [] });
    }
});

// -------------------------
app.listen(3000, () => console.log("Addon beží na porte 3000"));
