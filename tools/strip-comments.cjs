// Run by the GitHub Action on the built site: removes code comments (HTML, CSS and JavaScript)
// from every published file, so they stay only in the repo and do not show in the browser.
// Code is not renamed or rewritten, only comments and extra whitespace go.
// Usage: node tools/strip-comments.cjs [site folder, default _site]
const fs = require("node:fs");
const path = require("node:path");
const { minify: minifyHtml } = require("html-minifier-terser");
const { minify: minifyJs } = require("terser");

const site = path.resolve(process.argv[2] || "_site");
const JS = { compress: false, mangle: false, format: { comments: false } };

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});

(async () => {
  for (const file of walk(site)) {
    const src = fs.readFileSync(file, "utf8");
    let out;
    if (file.endsWith(".html")) {
      out = await minifyHtml(src, { removeComments: true, collapseWhitespace: true, conservativeCollapse: true, minifyCSS: true, minifyJS: JS });
    } else if (file.endsWith(".js")) {
      out = (await minifyJs(src, JS)).code;
    } else continue;
    fs.writeFileSync(file, out);
    console.log(path.relative(site, file) + ": " + src.length + " -> " + out.length + " bytes");
  }
})().catch((e) => { console.error(e); process.exit(1); });
