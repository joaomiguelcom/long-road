// Exports João's public Discogs collection to data/discogs.js (run by the GitHub Action after the setlist.fm export).
// No token needed for a public collection; the API allows 25 unauthenticated requests per minute.
// Usage: node tools/discogs.mjs [user]
import { writeFileSync } from "node:fs";

const user = process.argv[2] || "ojoaomiguel";
const headers = { "User-Agent": "LongRoad/1.0 +https://joaomiguelcom.github.io/long-road/" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(n) {
  const url = `https://api.discogs.com/users/${user}/collection/folders/0/releases?per_page=100&page=${n}&sort=artist`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) throw new Error(`Discogs ${res.status} on page ${n}: ${(await res.text()).slice(0, 200)}`);
    await sleep(5000 * attempt);
  }
  throw new Error(`Discogs kept failing on page ${n}`);
}

const records = [];
let n = 1, pages = 1;
do {
  const data = await page(n);
  pages = data.pagination.pages;
  for (const r of data.releases) {
    const b = r.basic_information;
    records.push({
      id: r.id,
      // "Beck (2)" → "Beck", "Sétima Legião*" → "Sétima Legião"
      artists: b.artists.map((a) => a.name.replace(/\s*\(\d+\)$/, "").replace(/\*$/, "")),
      title: b.title,
      year: b.year || null,
      format: [...new Set(b.formats.map((f) => f.name))].join(", "),
      url: `https://www.discogs.com/release/${r.id}`,
    });
  }
  n++;
  if (n <= pages) await sleep(2500);
} while (n <= pages);

const out = { user, generatedAt: new Date().toISOString(), count: records.length, records };
writeFileSync(new URL("../data/discogs.js", import.meta.url), "window.LONG_ROAD_DISCOGS = " + JSON.stringify(out) + ";\n");
console.log(`Saved ${records.length} records from Discogs.`);
