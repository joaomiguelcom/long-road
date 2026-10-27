// Long Road widget for the iPhone home screen, run by the Scriptable app (scriptable.app).
// Scriptable keeps a two-line loader that downloads this file from the site and runs it,
// so changes here reach the widget without touching the phone:
//   const r = new Request("https://longroad.joaomiguel.com/widget.js");
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

async function build() {
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.url = SITE;
  w.setPadding(14, 14, 14, 14);
  let shows = [];
  try { shows = await loadShows(); } catch (e) { /* offline: show the empty state */ }
  header(w);
  w.addSpacer(6);
  if (!shows.length) {
    const t = w.addText("No shows booked"); t.font = Font.mediumSystemFont(14); t.textColor = MUT;
    w.addSpacer();
    return w;
  }
  const family = config.widgetFamily || "medium";
  if (family === "small") {
    const s = shows[0];
    w.addSpacer();
    const big = w.addText(s.days === 0 ? "Tonight" : String(s.days)); big.font = Font.heavySystemFont(s.days === 0 ? 30 : 40); big.textColor = ACC;
    if (s.days > 0) { const u = w.addText(s.days === 1 ? "day to go" : "days to go"); u.font = Font.mediumSystemFont(11); u.textColor = MUT; }
    w.addSpacer(4);
    const a = w.addText(s.artist); a.font = Font.boldSystemFont(15); a.textColor = TXT; a.lineLimit = 2; a.minimumScaleFactor = 0.7;
    const p = w.addText(shortDate(s.day) + " · " + s.place.split(", ")[0]); p.font = Font.systemFont(11); p.textColor = MUT; p.lineLimit = 1;
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
  // refresh after midnight so "in N days" stays right
  const next = new Date(); next.setHours(24, 5, 0, 0); w.refreshAfterDate = next;
  return w;
}

async function main() {
  const widget = await build();
  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();
  Script.complete();
}
main();
