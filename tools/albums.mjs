// Exports the studio albums and their tracklists to data/albums.js (run by the GitHub Action after the exports).
// The artist page uses it for "Albums heard live": how much of each studio album João heard at his concerts.
// Only artists with 4+ concerts and a setlist at 70% of them or more (the app checks the same rule; João, 2026-10-29).
// Source: MusicBrainz (no key; 1 request per second and a User-Agent are required), covers from the Cover Art Archive.
// Studio album = release group of type Album with no secondary type (no live, compilation, soundtrack, remix…).
// Tracklist = the earliest official release of each album (the original edition, not the deluxe reissues).
// If MusicBrainz fails for an artist, the previous export of that artist is kept.
// Usage: node tools/albums.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const MIN_CONCERTS = 4;
const MIN_WITH_SETLIST = 0.7;
const UA = "LongRoad/1.0 ( https://longroad.joaomiguel.com )";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^the /, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

// the data files are plain scripts that set window.X; read them without a browser
const load = (file, key) => {
  if (!existsSync(file)) return null;
  const window = {};
  new Function("window", readFileSync(file, "utf8"))(window);
  return window[key];
};
const data = load("data/data.js", "LONG_ROAD");
const extra = load("extra.js", "LONG_ROAD_EXTRA");
const previous = (load("data/albums.js", "LONG_ROAD_ALBUMS") || {}).artists || {};
const all = data.concerts.concat((extra && extra.concerts) || []);

// setlist.fm already gives the MusicBrainz id of each artist
const mbids = {};
for (const s of JSON.parse(readFileSync("data/raw-attended.json", "utf8"))) if (s.artist && s.artist.mbid) mbids[s.artist.name] = s.artist.mbid;

const byArtist = {};
for (const c of all) (byArtist[c.artist] = byArtist[c.artist] || []).push(c);
const hasSet = (c) => (c.songs || []).some((s) => !s.tape && s.name);
const eligible = Object.keys(byArtist).filter((a) => byArtist[a].length >= MIN_CONCERTS && byArtist[a].filter(hasSet).length >= MIN_WITH_SETLIST * byArtist[a].length).sort();

let last = 0;
async function mb(path) {
  const url = "https://musicbrainz.org/ws/2/" + path + (path.includes("?") ? "&" : "?") + "fmt=json";
  for (let attempt = 1; attempt <= 4; attempt++) {
    await sleep(Math.max(0, last + 1100 - Date.now()));
    last = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.ok) return res.json();
    // 503 = over the rate limit; wait and try again
    await sleep(3000 * attempt);
  }
  throw new Error("MusicBrainz kept failing: " + path);
}

async function artistId(name) {
  if (mbids[name]) return mbids[name];
  const body = await mb("artist?limit=5&query=" + encodeURIComponent('artist:"' + name + '"'));
  const hit = (body.artists || []).find((a) => plain(a.name) === plain(name));
  return hit ? hit.id : null;
}

const VIDEO = /dvd|blu-ray|vhs|video/i;
// earliest official release; same day → the track count most editions share (the deluxe and vinyl splits are
// the odd ones out), then CD or digital, then the shorter one (no bonus tracks)
function original(releases) {
  const fmt = (r) => ((r.media || []).some((m) => /^(CD|Digital Media)$/.test(m.format || "")) ? 0 : 1);
  const len = (r) => (r.media || []).filter((m) => !VIDEO.test(m.format || "")).reduce((n, m) => n + (m.tracks || []).length, 0);
  const day = (r) => r.date.slice(0, 10).padEnd(10, "~");
  const ok = releases.filter((r) => r.date && len(r));
  const common = {};
  for (const r of ok) common[len(r)] = (common[len(r)] || 0) + 1;
  return ok.sort((a, b) => day(a).localeCompare(day(b)) || common[len(b)] - common[len(a)] || fmt(a) - fmt(b) || len(a) - len(b))[0];
}

async function albums(mbid) {
  const today = new Date().toISOString().slice(0, 10);
  const groups = [];
  for (let offset = 0; ; offset += 100) {
    const body = await mb("release-group?artist=" + mbid + "&type=album&inc=artist-credits&limit=100&offset=" + offset);
    groups.push(...body["release-groups"]);
    if (offset + 100 >= body["release-group-count"]) break;
  }
  const studio = groups.filter((g) => g["primary-type"] === "Album" && !(g["secondary-types"] || []).length &&
    g["first-release-date"] && g["first-release-date"] <= today &&
    // only albums credited to this artist alone (no collaborations)
    (g["artist-credit"] || []).length === 1 && g["artist-credit"][0].artist.id === mbid);
  const out = [];
  for (const g of studio) {
    const body = await mb("release?release-group=" + g.id + "&status=official&inc=recordings+media&limit=100");
    const r = original(body.releases || []);
    if (!r) continue;
    const tracks = [];
    for (const m of r.media || []) if (!VIDEO.test(m.format || "")) for (const t of m.tracks || []) if (!tracks.includes(t.title)) tracks.push(t.title);
    if (tracks.length) out.push({ title: g.title, year: +g["first-release-date"].slice(0, 4), date: g["first-release-date"], cover: "https://coverartarchive.org/release-group/" + g.id + "/front-250", tracks });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).map(({ date, ...a }) => a);
}

const artists = {};
let failed = 0;
for (const name of eligible) {
  try {
    const id = await artistId(name);
    if (!id) throw new Error("not found on MusicBrainz");
    artists[name] = { mbid: id, albums: await albums(id) };
    console.log(`${name}: ${artists[name].albums.length} studio albums`);
  } catch (e) {
    failed++;
    if (previous[name]) artists[name] = previous[name];
    console.log(`${name}: ${e.message}${previous[name] ? " (kept the previous export)" : ""}`);
  }
}
writeFileSync("data/albums.js", "window.LONG_ROAD_ALBUMS = " + JSON.stringify({ source: "MusicBrainz", generatedAt: new Date().toISOString().slice(0, 19) + "Z", artists }) + ";\n");
console.log(`Albums: ${eligible.length - failed} of ${eligible.length} artists exported.`);
