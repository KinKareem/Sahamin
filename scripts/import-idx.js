// Mengubah daftar emiten BEI menjadi data/stocks.json
//
// Cara 1 (otomatis):   node scripts/import-idx.js
// Cara 2 (manual):     buka URL di bawah di browser, simpan hasilnya sebagai idx.json, lalu
//                      node scripts/import-idx.js idx.json
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const IDX_URL =
  "https://www.idx.co.id/primary/ListedCompany/GetCompanyProfiles?emitenType=s&start=0&length=9999";
const out = path.join(here, "..", "data", "stocks.json");

async function load(file) {
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const r = await fetch(IDX_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
      Referer: "https://www.idx.co.id/id/perusahaan-tercatat/profil-perusahaan-tercatat/",
    },
  });
  if (!r.ok) throw new Error(`IDX membalas ${r.status}`);
  return r.json();
}

const cleanName = (s) =>
  String(s || "").replace(/^PT\.?\s+/i, "").replace(/[,\s]*Tbk\.?$/i, "").replace(/\s+/g, " ").trim();

try {
  const j = await load(process.argv[2]);
  const rows = Array.isArray(j) ? j : j.data || j.Data || j.Results || [];
  const stocks = rows
    .map((r) => ({
      c: String(r.KodeEmiten || r.Kode || r.code || "").trim().toUpperCase(),
      n: cleanName(r.NamaEmiten || r.Nama || r.name),
      s: String(r.Sektor || r.sector || "").trim() || "Lainnya",
    }))
    .filter((x) => /^[A-Z0-9]{4}$/.test(x.c) && x.n)
    .sort((a, b) => a.c.localeCompare(b.c));

  if (stocks.length < 100) throw new Error(`Hanya ${stocks.length} emiten terbaca, format data mungkin berubah`);
  writeFileSync(out, JSON.stringify(stocks, null, 1));
  const per = {};
  stocks.forEach((x) => (per[x.s] = (per[x.s] || 0) + 1));
  console.log(`Tersimpan ${stocks.length} emiten ke data/stocks.json`);
  console.table(per);
} catch (e) {
  console.error("\nGagal mengambil data dari BEI:", e.message);
  console.error(
    "Situs BEI sering memblokir permintaan dari server. Solusinya:\n" +
      `  1. Buka ${IDX_URL} di browser\n` +
      "  2. Simpan halaman sebagai idx.json\n" +
      "  3. Jalankan: node scripts/import-idx.js idx.json\n"
  );
  process.exit(1);
}
