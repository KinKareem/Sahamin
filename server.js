import express from "express";
import { XMLParser } from "fast-xml-parser";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const stocks = JSON.parse(readFileSync(path.join(here, "data", "stocks.json"), "utf8"));
const xml = new XMLParser({ ignoreAttributes: false });
const app = express();

// Cache sederhana di memori agar API luar tidak dipanggil berulang.
const cache = new Map();
async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await loader();
  cache.set(key, { t: Date.now(), v });
  return v;
}
const MIN = 60 * 1000;

// Daftar saham, dimuat browser sebagai window.STOCKS
app.get("/api/stocks.js", (_req, res) => {
  res.type("application/javascript").send("window.STOCKS=" + JSON.stringify(stocks) + ";");
});

// Harga harian 1 tahun dari Yahoo Finance (tidak resmi, tertunda)
app.get("/api/chart/:code", async (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return res.status(400).json({ error: "Kode saham tidak valid" });
  try {
    const data = await cached("chart:" + code, 10 * MIN, async () => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.JK?range=1y&interval=1d`;
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) throw new Error("Yahoo Finance membalas " + r.status);
      const result = (await r.json()).chart?.result?.[0];
      if (!result) throw new Error("Data kosong");
      const close = result.indicators.quote[0].close || [];
      const points = [];
      (result.timestamp || []).forEach((t, i) => {
        if (close[i] != null) points.push({ t: t * 1000, p: Math.round(close[i]) });
      });
      return { points };
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Berita dari Google News RSS (judul, sumber, tanggal, link asli)
app.get("/api/news", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 200);
  if (!q) return res.status(400).json({ error: "Parameter q wajib diisi" });
  try {
    const items = await cached("news:" + q, 10 * MIN, async () => {
      const url = "https://news.google.com/rss/search?hl=id&gl=ID&ceid=ID:id&q=" +
        encodeURIComponent(q + " when:7d");
      const r = await fetch(url);
      if (!r.ok) throw new Error("RSS membalas " + r.status);
      const raw = xml.parse(await r.text()).rss?.channel?.item ?? [];
      return (Array.isArray(raw) ? raw : [raw]).slice(0, 10).map((it) => ({
        title: String(it.title || "").replace(/\s+-\s+[^-]+$/, ""),
        link: it.link,
        source: typeof it.source === "object" ? it.source["#text"] : it.source,
        date: it.pubDate,
      }));
    });
    let summary = null;
    if (req.query.ai === "1" && process.env.ANTHROPIC_API_KEY && items.length) {
      summary = await cached("sum:" + q, 30 * MIN, () => summarize(q, items)).catch(() => null);
    }
    res.json({ items, summary });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Ringkasan AI (opsional, aktif jika ANTHROPIC_API_KEY diisi)
async function summarize(topic, items) {
  const headlines = items.map((x, i) => `${i + 1}. ${x.title} (${x.source})`).join("\n");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "claude-haiku-5-5",
      max_tokens: 300,
      system:
        "Kamu meringkas berita pasar modal Indonesia. Berdasarkan HANYA judul yang diberikan, " +
        "tulis 2-3 kalimat bahasa Indonesia tentang tema utamanya. Jangan menambah fakta di luar judul, " +
        "jangan memberi saran beli/jual/tahan, dan jangan memprediksi harga.",
      messages: [{ role: "user", content: `Topik: ${topic}\n\nJudul berita:\n${headlines}` }],
    }),
  });
  if (!r.ok) return null;
  return (await r.json()).content?.[0]?.text?.trim() || null;
}

app.use(express.static(path.join(here, "public")));
app.listen(PORT, () => console.log(`Sahamin berjalan di http://localhost:${PORT}`));
