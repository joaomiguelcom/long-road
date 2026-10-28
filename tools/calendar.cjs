// Builds concerts.ics from upcoming.js: a calendar João subscribes to once (webcal://), so booked shows
// show up in his phone's calendar. Shows with a `time` get a start time (Lisbon time, 2h30 long);
// the others are all-day events. `location` overrides `place` (festivals list the edition as the place);
// venues in venue-geo.json get a map pin. Past shows stay in upcoming.js for two years so their events keep the time.
// Usage: node tools/calendar.cjs <site dir>
const fs = require("fs");
const path = require("path");
const out = process.argv[2] || ".";
const window = {};
new Function("window", fs.readFileSync(path.join(__dirname, "..", "upcoming.js"), "utf8"))(window);
const shows = (window.LONG_ROAD_UPCOMING || {}).shows || [];
// the archive, as the app sees it: setlist.fm export + extra.js, with renamed venues merged (VENUE_ALIASES in index.html)
const data = {};
for (const f of ["data/data.js", "extra.js"]) try { new Function("window", fs.readFileSync(path.join(__dirname, "..", f), "utf8"))(data); } catch (e) {}
const plain = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
let ALIASES = [];
try { ALIASES = new Function("return " + fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").match(/const VENUE_ALIASES = (\[[\s\S]*?\n  \]);/)[1])(); } catch (e) {}
const venueName = (venue, city) => { const r = ALIASES.find((r) => plain(r.city) === plain(city) && r.aka.some((w) => plain(w) === plain(venue))); return r ? r.name : venue; };
const archive = ((data.LONG_ROAD || {}).concerts || []).concat((data.LONG_ROAD_EXTRA || {}).concerts || [])
  .map((c) => ({ ...c, venue: venueName(c.venue, c.city), songs: c.songs || [] }))
  .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
const pos = new Map(archive.map((c, i) => [c.id, i + 1]));
const seen = new Map(archive.map((c) => [c.date + "|" + plain(c.artist), c]));
const fmtN = (n) => n.toLocaleString("en-GB");
const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d) => +d.slice(8) + " " + MONTHS[+d.slice(5, 7) - 1] + " " + d.slice(0, 4);
const songs = (c) => c.songs.filter((x) => !x.tape && x.name);
const isMilestone = (n) => n >= 1000 ? n % 250 === 0 : n % 100 === 0;

// the text under the event: what the archive says about this artist and venue before the show,
// and how the night went once the export has it
function describe(s, i) {
  const out = [], done = s.date < today ? seen.get(s.date + "|" + plain(s.artist)) : null;
  const before = archive.filter((c) => c.date < s.date);
  const mine = before.filter((c) => plain(c.artist) === plain(s.artist));
  // setlist.fm writes rooms as "Casa da Música (Sala 2)"; the archive counts the room as the building
  const where = (s.location || s.place || "").split(", "), room = where[0].replace(/ \(.*\)$/, "");
  const venue = archive.some((c) => plain(c.venue) === plain(where[0])) ? venueName(where[0], where[1]) : venueName(room, where[1]);
  if (done) {
    const n = pos.get(done.id), list = songs(done);
    const heard = new Set(before.flatMap((c) => songs(c).map((x) => plain(x.name) + "|" + plain(x.cover || c.artist))));
    const fresh = list.filter((x) => !heard.has(plain(x.name) + "|" + plain(x.cover || done.artist))).length;
    out.push([["Concert #" + fmtN(n)].concat(list.length ? [list.length + " songs"] : [], fresh ? [fresh + " new for you"] : []).join(" • ")]);
    if (list.length > 1) out.push(["Opened with " + list[0].name + ", closed with " + list[list.length - 1].name]);
    out.push([SITE + "#t=concerts&c=" + done.id]);
    return out;
  }
  // its number: the archive so far plus the booked shows before it that are not in the archive yet
  const pending = shows.filter((x, j) => (x.date < s.date || (x.date === s.date && j < i)) && !(x.date < today && seen.has(x.date + "|" + plain(x.artist))));
  const n = before.length + pending.length + 1;
  // three blocks with a blank line between them: the headline, the history, the link
  const head = "This will be concert #" + fmtN(n) + (isMilestone(n) ? " (a milestone!)" : "") + " • " +
    (mine.length ? ordinal(mine.length + 1) + " time seeing " + s.artist : "First time seeing " + s.artist + " live!");
  out.push([head]);
  const hist = [];
  out.push(hist);
  if (mine.length) {
    const last = mine[mine.length - 1], first = mine[0];
    hist.push("Last time: " + fmtDate(last.date) + ", " + last.venue);
    if (mine.length > 1) hist.push("First time: " + fmtDate(first.date) + ", " + first.venue);
    const count = new Map();
    for (const c of mine) for (const x of songs(c)) count.set(x.name, (count.get(x.name) || 0) + 1);
    const top = [...count].filter((x) => x[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) hist.push("Most heard live: " + top.map(([k, v]) => k + " (" + v + ")").join(", "));
  }
  if (venue) {
    const placeOf = (x) => { const w = (x.location || x.place || "").split(", ")[0]; return plain(w.replace(/ \(.*\)$/, "")) === plain(venue) || plain(w) === plain(venue); };
    const dates = new Set(before.filter((c) => plain(c.venue) === plain(venue)).map((c) => c.date).concat(pending.filter(placeOf).map((x) => x.date)));
    const nights = dates.size + (dates.has(s.date) ? 0 : 1);
    hist.push(nights === 1 ? "First time at " + venue : "Your " + ordinal(nights) + " " + (s.location ? "day" : "night") + " at " + venue);
  }
  if (s.url) out.push([s.url]);
  return out;
}
const geo = JSON.parse(fs.readFileSync(path.join(__dirname, "venue-geo.json"), "utf8"));
const SITE = "https://longroad.joaomiguel.com/";
const today = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
// lines longer than 75 octets continue on the next line after a space (RFC 5545)
const fold = (line) => {
  const parts = []; let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (parts.length ? 74 : 75)) { parts.push(cur); cur = ""; }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
};
const ymd = (d) => d.replace(/-/g, "");
const nextDay = (d) => new Date(Date.parse(d + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
const slug = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

const lines = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Long Road//Upcoming concerts//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
  "X-WR-CALNAME:Long Road", "X-WR-CALDESC:Upcoming concerts from longroad.joaomiguel.com", "X-WR-TIMEZONE:Europe/Lisbon",
  "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
  // Portugal: WET in winter, WEST from the last Sunday of March to the last Sunday of October
  "BEGIN:VTIMEZONE", "TZID:Europe/Lisbon",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0000", "TZOFFSETTO:+0100", "TZNAME:WEST", "DTSTART:19700329T010000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0000", "TZNAME:WET", "DTSTART:19701025T020000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];
// shows older than two years leave the calendar even if upcoming.js still has them
const cutoff = new Date(Date.now() - 2 * 365.25 * 864e5).toISOString().slice(0, 10);
shows.forEach((s, i) => {
  if (s.date < cutoff) return;
  const ev = ["BEGIN:VEVENT", "UID:" + s.date + "-" + slug(s.artist) + "@longroad.joaomiguel.com", "DTSTAMP:" + stamp, "SUMMARY:" + esc(s.artist)];
  if (s.time) {
    const [h, m] = s.time.split(":").map(Number), end = h * 60 + m + 150;
    const endDate = end >= 1440 ? nextDay(s.date) : s.date, e = end % 1440;
    ev.push("DTSTART;TZID=Europe/Lisbon:" + ymd(s.date) + "T" + String(h).padStart(2, "0") + String(m).padStart(2, "0") + "00",
      "DTEND;TZID=Europe/Lisbon:" + ymd(endDate) + "T" + String(Math.floor(e / 60)).padStart(2, "0") + String(e % 60).padStart(2, "0") + "00");
  } else {
    ev.push("DTSTART;VALUE=DATE:" + ymd(s.date), "DTEND;VALUE=DATE:" + ymd(nextDay(s.date)), "TRANSP:TRANSPARENT");
  }
  // with coordinates the phone shows the venue on a map, like a place picked by hand
  const where = s.location || s.place || "", name = where.split(", ")[0], g = geo[name];
  if (g) {
    ev.push("LOCATION:" + esc(name + "\n" + g.address));
    ev.push('X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="' + g.address.replace(/"/g, "") + '";X-APPLE-RADIUS=100;X-TITLE="' + name.replace(/"/g, "") + '":geo:' + g.lat + "," + g.lng);
  } else ev.push("LOCATION:" + esc(where));
  const blocks = describe(s, i).filter((b) => b.length);
  if (s.location && s.place) blocks[0].unshift(s.place);
  ev.push("DESCRIPTION:" + esc(blocks.map((b) => b.join("\n")).join("\n\n")));
  ev.push("END:VEVENT");
  lines.push(...ev);
});
lines.push("END:VCALENDAR");
fs.writeFileSync(path.join(out, "concerts.ics"), lines.map(fold).join("\r\n") + "\r\n");
console.log("concerts.ics: " + shows.length + " shows");
