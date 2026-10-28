// Builds concerts.ics from upcoming.js: a calendar João subscribes to once (webcal://), so booked shows
// show up in his phone's calendar. Shows with a `time` get a start time (Lisbon time, 2h30 long);
// the others are all-day events. `location` overrides `place` (festivals list the edition as the place).
// Usage: node tools/calendar.cjs <site dir>
const fs = require("fs");
const path = require("path");
const out = process.argv[2] || ".";
const window = {};
new Function("window", fs.readFileSync(path.join(__dirname, "..", "upcoming.js"), "utf8"))(window);
const shows = (window.LONG_ROAD_UPCOMING || {}).shows || [];

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
for (const s of shows) {
  const ev = ["BEGIN:VEVENT", "UID:" + s.date + "-" + slug(s.artist) + "@longroad.joaomiguel.com", "DTSTAMP:" + stamp, "SUMMARY:" + esc(s.artist)];
  if (s.time) {
    const [h, m] = s.time.split(":").map(Number), end = h * 60 + m + 150;
    const endDate = end >= 1440 ? nextDay(s.date) : s.date, e = end % 1440;
    ev.push("DTSTART;TZID=Europe/Lisbon:" + ymd(s.date) + "T" + String(h).padStart(2, "0") + String(m).padStart(2, "0") + "00",
      "DTEND;TZID=Europe/Lisbon:" + ymd(endDate) + "T" + String(Math.floor(e / 60)).padStart(2, "0") + String(e % 60).padStart(2, "0") + "00");
  } else {
    ev.push("DTSTART;VALUE=DATE:" + ymd(s.date), "DTEND;VALUE=DATE:" + ymd(nextDay(s.date)), "TRANSP:TRANSPARENT");
  }
  ev.push("LOCATION:" + esc(s.location || s.place || ""));
  if (s.location && s.place) ev.push("DESCRIPTION:" + esc(s.place));
  if (s.url) ev.push("URL:" + s.url);
  ev.push("END:VEVENT");
  lines.push(...ev);
}
lines.push("END:VCALENDAR");
fs.writeFileSync(path.join(out, "concerts.ics"), lines.map(fold).join("\r\n") + "\r\n");
console.log("concerts.ics: " + shows.length + " shows");
