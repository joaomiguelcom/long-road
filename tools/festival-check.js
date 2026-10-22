// Lists concerts that still need a festival check: not matched by any
// FESTIVAL_EDITIONS entry in index.html and not yet in tools/reviewed-ids.txt.
// Usage: node tools/festival-check.js            -> JSON groups (date + venue)
//        node tools/festival-check.js --mark-all -> add every pending id to reviewed-ids.txt
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const literal = html.match(/const FESTIVAL_EDITIONS = (\[[\s\S]*?\n\s*\]);/)[1];
const editions = Function(`return ${literal}`)();

// Same matching rule as index.html
const DAY = 86400000;
const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const shift = (iso, days) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);
const festivalOf = (c) => editions.find((e) => {
  const pad = e.pad == null ? 2 : e.pad;
  return [].concat(e.venue).some((v) => plain(v) === plain(c.venue)) && c.date >= shift(e.from, -pad) && c.date <= shift(e.to, pad);
});

const reviewedFile = path.join(__dirname, "reviewed-ids.txt");
const reviewed = new Set(fs.existsSync(reviewedFile) ? fs.readFileSync(reviewedFile, "utf8").split(/\s+/).filter(Boolean) : []);
const { concerts } = JSON.parse(fs.readFileSync(path.join(root, "data", "concerts.json"), "utf8"));
const pending = concerts.filter((c) => !reviewed.has(c.id) && !festivalOf(c));

if (process.argv.includes("--mark-all")) {
  const ids = [...reviewed, ...pending.map((c) => c.id)].sort();
  fs.writeFileSync(reviewedFile, ids.join("\n") + "\n");
  console.log(`Marked ${pending.length} concerts as reviewed.`);
} else {
  const groups = new Map();
  for (const c of pending) {
    const key = `${c.date}|${c.venue}|${c.city}`;
    if (!groups.has(key)) groups.set(key, { date: c.date, venue: c.venue, city: c.city, country: c.country, concerts: [] });
    groups.get(key).concerts.push({ id: c.id, artist: c.artist, url: c.url, tour: c.tour, info: c.info });
  }
  console.log(JSON.stringify([...groups.values()], null, 2));
}
