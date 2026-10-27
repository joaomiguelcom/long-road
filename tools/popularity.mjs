// Exports how popular each artist in the archive is to data/popularity.js (run by the GitHub Action after the exports).
// Source: Deezer's public API (number of fans per artist), no key needed; it allows 50 requests every 5 seconds.
// The app uses it to break ties in the Year in review top artists: the bigger artist comes first.
// Only exact name matches count (accents and case ignored); artists Deezer does not know get 0.
// Usage: node tools/popularity.mjs
import { readFileSync, writeFileSync } from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^the /, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

// the data files are plain scripts that set window.X; read them without a browser
const load = (file, key) => {
  const window = {};
  new Function("window", readFileSync(file, "utf8"))(window);
  return window[key];
};
const data = load("data/data.js", "LONG_ROAD");
const extra = load("extra.js", "LONG_ROAD_EXTRA");
const names = [...new Set(data.concerts.concat((extra && extra.concerts) || []).map((c) => c.artist))].sort();

async function fans(name) {
  const url = "https://api.deezer.com/search/artist?limit=10&q=" + encodeURIComponent(name);
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url);
    const body = res.ok ? await res.json() : null;
    // Deezer reports its rate limit as an error inside a 200 answer
    if (body && !body.error) {
      const hit = (body.data || []).filter((a) => plain(a.name) === plain(name)).sort((a, b) => b.nb_fan - a.nb_fan)[0];
      return hit ? hit.nb_fan : 0;
    }
    await sleep(5000 * attempt);
  }
  throw new Error("Deezer kept failing for " + name);
}

const out = {};
for (const name of names) {
  out[name] = await fans(name);
  await sleep(120);
}
const found = Object.values(out).filter(Boolean).length;
writeFileSync("data/popularity.js", "window.LONG_ROAD_POPULARITY = " + JSON.stringify({ source: "Deezer fans", generatedAt: new Date().toISOString().slice(0, 19) + "Z", fans: out }) + ";\n");
console.log(`Popularity: ${found} of ${names.length} artists found on Deezer.`);
