// Mengecek kunci API, nama model, dan fitur pencarian web Gemini.
// Jalankan:  npm run test:gemini
import "dotenv/config";

const key = process.env.GEMINI_API_KEY;
const base = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models";
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
if (!key) {
  console.error("GEMINI_API_KEY kosong. Isi dulu di file .env");
  process.exit(1);
}
const headers = { "x-goog-api-key": key, "content-type": "application/json" };

// 1. Cek kunci dan daftar model yang tersedia untuk kunci ini
let r = await fetch(base + "?pageSize=200", { headers });
let j = await r.json().catch(() => ({}));
console.log(`\n[1] Daftar model -> HTTP ${r.status}`);
if (!r.ok) {
  console.log("Pesan dari Google:", j?.error?.message || JSON.stringify(j));
  console.log("Kemungkinan kunci salah, salah salin, atau belum aktif. Buat kunci baru di aistudio.google.com/app/apikey");
  process.exit(1);
}
const names = (j.models || [])
  .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
  .map((m) => m.name.replace("models/", ""));
console.log("Model Flash yang tersedia:\n  " + names.filter((n) => /flash/.test(n)).join("\n  "));
console.log(`\nGEMINI_MODEL di .env: ${model} -> ${names.includes(model) ? "ADA" : "TIDAK ADA di daftar. Ganti GEMINI_MODEL di .env dengan salah satu model di atas."}`);

// 2. Uji jawaban biasa dan pencarian web
for (const [label, extra] of [["jawaban biasa", {}], ["pencarian web", { tools: [{ google_search: {} }] }]]) {
  r = await fetch(`${base}/${model}:generateContent`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Apa itu IHSG? Jawab satu kalimat." }] }], ...extra }),
  });
  j = await r.json().catch(() => ({}));
  console.log(`\n[2] ${label} -> HTTP ${r.status}`);
  console.log(
    r.ok
      ? (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").slice(0, 200) || "(jawaban kosong)"
      : String(j?.error?.message || JSON.stringify(j)).slice(0, 400)
  );
}