// Shrinks the published data/data.js: drops empty fields (null, false, "", []) and the default
// set name "Main". The app puts the defaults back when it loads. The repo keeps the full export.
// Usage: node tools/slim-data.cjs _site/data/data.js
const fs = require("fs");
const file = process.argv[2];
const text = fs.readFileSync(file, "utf8");
const data = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
const empty = (v) => v === null || v === false || v === "" || (Array.isArray(v) && !v.length);
const slim = (o, skip) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !empty(v) && !(skip && skip(k, v))));
data.concerts = data.concerts.map((c) => {
  const out = slim(c);
  if (out.songs) out.songs = out.songs.map((s) => slim(s, (k, v) => k === "set" && v === "Main"));
  return out;
});
const out = "window.LONG_ROAD = " + JSON.stringify(data) + ";\n";
fs.writeFileSync(file, out);
console.log("data.js: " + text.length + " -> " + out.length + " bytes");
