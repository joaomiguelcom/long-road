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
// past shows point to their page in the app once the export has them (same date and artist)
const data = {};
try { new Function("window", fs.readFileSync(path.join(__dirname, "..", "data", "data.js"), "utf8"))(data); } catch (e) {}
const seen = new Map(((data.LONG_ROAD || {}).concerts || []).map((c) => [c.date + "|" + c.artist.toLowerCase(), c.id]));
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
for (const s of shows.filter((x) => x.date >= cutoff)) {
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
  // before the show: the setlist.fm page; after it, once the export has it: the concert in the app
  const id = s.date < today ? seen.get(s.date + "|" + String(s.artist).toLowerCase()) : null;
  const desc = [];
  if (s.location && s.place) desc.push(s.place);
  if (id) desc.push("Long Road: " + SITE + "#t=concerts&c=" + id);
  else if (s.url) desc.push("setlist.fm: " + s.url);
  if (desc.length) ev.push("DESCRIPTION:" + esc(desc.join("\n")));
  ev.push("END:VEVENT");
  lines.push(...ev);
}
lines.push("END:VCALENDAR");
fs.writeFileSync(path.join(out, "concerts.ics"), lines.map(fold).join("\r\n") + "\r\n");
console.log("concerts.ics: " + shows.length + " shows");
