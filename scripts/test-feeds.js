// Menguji semua RSS di data/feeds.json: mana yang hidup, berapa artikel, dan seberapa baru.
// Jalankan:  npm run test:feeds
import { XMLParser } from "fast-xml-parser";
import { readFileSync } from "node:fs";

const feeds = JSON.parse(readFileSync(new URL("../data/feeds.json", import.meta.url), "utf8"));
const xml = new XMLParser({ ignoreAttributes: false });

const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
};

console.log(`Menguji ${feeds.length} feed...\n`);
const lines = await Promise.all(
  feeds.map(async (f) => {
    try {
      const r = await fetch(f.url, { headers: { "User-Agent": "Mozilla/5.0 (Sahamin)" }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return `GAGAL  ${f.name}: HTTP ${r.status}  (${f.url})`;
      const doc = xml.parse(await r.text());
      const raw = doc.rss?.channel?.item ?? [];
      const items = Array.isArray(raw) ? raw : [raw];
      if (!items.length)
        return `KOSONG ${f.name}: terbaca tetapi 0 artikel. Mungkin format Atom (belum didukung) atau bukan RSS  (${f.url})`;
      const newest = Math.max(...items.map((i) => Date.parse(i.pubDate) || 0));
      return `OK     ${f.name}: ${items.length} artikel, terbaru ${newest ? ago(newest) : "tanggal tidak terbaca"}`;
    } catch (e) {
      return `GAGAL  ${f.name}: ${e.message}  (${f.url})`;
    }
  })
);
lines.forEach((l) => console.log(l));
console.log("\nHapus baris yang GAGAL/KOSONG dari data/feeds.json, atau ganti dengan alamat RSS yang benar.");
