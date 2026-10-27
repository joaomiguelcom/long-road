// Long Road widget for the iPhone home screen, run by the Scriptable app (scriptable.app).
// Scriptable keeps a two-line loader that downloads this file from the site and runs it,
// so changes here reach the widget without touching the phone:
//   const r = new Request("https://longroad.joaomiguel.com/widget.js?t=" + Date.now());  (query string skips the 10-minute cache)
//   await eval(await r.loadString());
// eval cannot wait on its own, so this file ends with a promise and the loader awaits it.
// Small widget: the next concert and the days left. Medium and large: the next shows as a list.
// Data: upcoming.js, the same list the site shows in "Next up".

const SITE = "https://longroad.joaomiguel.com";
const BG = new Color("#0F1115"), TXT = new Color("#ECEDEE"), MUT = new Color("#9AA0A6"), ACC = new Color("#F2A541");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function loadShows() {
  const js = await new Request(SITE + "/upcoming.js?t=" + Date.now()).loadString();
  const window = {};
  new Function("window", js)(window);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return ((window.LONG_ROAD_UPCOMING || {}).shows || [])
    .map((s) => ({ ...s, day: new Date(s.date + "T00:00:00") }))
    .filter((s) => s.day >= today)
    .map((s) => ({ ...s, days: Math.round((s.day - today) / 86400000) }));
}
const when = (n) => n === 0 ? "Tonight" : n === 1 ? "Tomorrow" : "in " + n + " days";
// "Coliseu do Porto, Porto, Portugal" → "Coliseu do Porto · Porto"
const place = (p) => p.split(", ").slice(0, 2).join(" · ");
const shortDate = (d) => d.getDate() + " " + MONTHS[d.getMonth()];

function header(w) {
  const h = w.addStack(); h.centerAlignContent();
  const t = h.addText("LONG ROAD"); t.font = Font.boldSystemFont(11); t.textColor = ACC;
  h.addSpacer();
  const n = h.addText("NEXT UP"); n.font = Font.mediumSystemFont(10); n.textColor = MUT;
}

// refresh after midnight so the day count stays right
function setRefresh(w) { const next = new Date(); next.setHours(24, 5, 0, 0); w.refreshAfterDate = next; }

async function build() {
  const w = new ListWidget();
  w.backgroundColor = BG;
  // no url: iOS always opens the widget's app on a tap, so leaving it out is the closest to "nothing happens"
  w.setPadding(14, 14, 14, 14);
  const family = config.widgetFamily || "medium";
  let shows = [];
  try { shows = await loadShows(); } catch (e) { /* offline: show the empty state */ }
  header(w);
  w.addSpacer(family === "small" ? 8 : 6);
  if (!shows.length) {
    const t = w.addText("No shows booked"); t.font = Font.mediumSystemFont(14); t.textColor = MUT;
    w.addSpacer();
    return w;
  }
  if (family === "small") {
    // artist first, the countdown at the bottom, and the show after it to fill the space
    const s = shows[0];
    const a = w.addText(s.artist); a.font = Font.boldSystemFont(22); a.textColor = TXT; a.lineLimit = 2; a.minimumScaleFactor = 0.6;
    const p = w.addText(shortDate(s.day) + " · " + s.place.split(", ")[0]); p.font = Font.systemFont(13); p.textColor = MUT; p.lineLimit = 1;
    w.addSpacer();
    const row = w.addStack(); row.bottomAlignContent();
    const big = row.addText(s.days === 0 ? "Tonight" : String(s.days)); big.font = Font.heavySystemFont(s.days === 0 ? 32 : 50); big.textColor = ACC; big.minimumScaleFactor = 0.7;
    if (s.days > 0) {
      row.addSpacer(5);
      const u = row.addStack(); u.layoutVertically();
      const u1 = u.addText(s.days === 1 ? "day" : "days"); u1.font = Font.mediumSystemFont(13); u1.textColor = MUT;
      const u2 = u.addText("to go"); u2.font = Font.mediumSystemFont(13); u2.textColor = MUT;
      u.addSpacer(7);
    }
    if (shows[1]) {
      w.addSpacer(2);
      const t = w.addText("Then " + shortDate(shows[1].day) + " · " + shows[1].artist); t.font = Font.systemFont(11); t.textColor = MUT; t.lineLimit = 1; t.minimumScaleFactor = 0.8;
    }
    setRefresh(w);
    return w;
  }
  const max = family === "large" ? 7 : 3;
  shows.slice(0, max).forEach((s, i) => {
    if (i) w.addSpacer(family === "large" ? 10 : 6);
    const row = w.addStack(); row.centerAlignContent();
    const date = row.addStack(); date.layoutVertically(); date.size = new Size(38, 0);
    const m = date.addText(MONTHS[s.day.getMonth()].toUpperCase()); m.font = Font.semiboldSystemFont(9); m.textColor = ACC;
    const d = date.addText(String(s.day.getDate())); d.font = Font.boldSystemFont(18); d.textColor = TXT;
    row.addSpacer(8);
    const mid = row.addStack(); mid.layoutVertically();
    const a = mid.addText(s.artist); a.font = Font.boldSystemFont(14); a.textColor = TXT; a.lineLimit = 1;
    const p = mid.addText(place(s.place)); p.font = Font.systemFont(11); p.textColor = MUT; p.lineLimit = 1;
    row.addSpacer();
    const n = row.addText(when(s.days)); n.font = Font.mediumSystemFont(11); n.textColor = i === 0 ? ACC : MUT;
  });
  if (shows.length > max) {
    w.addSpacer(6);
    const more = w.addText("+ " + (shows.length - max) + " more booked"); more.font = Font.systemFont(10); more.textColor = MUT;
  }
  w.addSpacer();
  setRefresh(w);
  return w;
}

async function main() {
  const widget = await build();
  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();
  Script.complete();
}
main();
