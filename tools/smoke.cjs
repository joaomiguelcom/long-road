// Smoke test run by the GitHub Action before every deploy: opens the built site in Chrome,
// clicks through every tab and a few detail pages, and fails if the page throws or shows nothing.
// Usage: node tools/smoke.cjs [site folder, default _site]
const path = require("node:path");
let pw;
try { pw = require("playwright-core"); } catch (e) { pw = require("playwright"); }

const site = path.resolve(process.argv[2] || "_site");
const chrome = process.env.CHROME_PATH; // the GitHub runner has Chrome installed; locally Playwright's own Chromium is used

(async () => {
  const browser = await pw.chromium.launch(chrome ? { executablePath: chrome } : {});
  const errors = [];
  const check = async (page, what) => {
    const text = (await page.locator("#app").innerText()).trim();
    if (text.length < 20) errors.push(what + ": the view is empty");
  };
  for (const [name, opts] of [["desktop", { viewport: { width: 1280, height: 900 } }], ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const page = await browser.newPage(opts);
    page.on("pageerror", (e) => errors.push(name + ": " + e.message));
    // the map tiles and web fonts are not needed to test the app
    await page.route(/arcgis|fonts\.g|cloudflareinsights/, (r) => r.abort());
    await page.goto("file://" + site + "/index.html");
    await page.waitForTimeout(800);
    await check(page, name + " overview");
    for (const tab of await page.locator("#tabs [data-tab]").evaluateAll((l) => l.map((b) => b.dataset.tab))) {
      await page.click('#tabs [data-tab="' + tab + '"]');
      await page.waitForTimeout(300);
      await check(page, name + " " + tab);
    }
    const open = async (attr, value, what) => {
      await page.evaluate(([a, v]) => { const b = document.createElement("button"); b.dataset[a] = v; document.body.appendChild(b); b.click(); b.remove(); }, [attr, value]);
      await page.waitForTimeout(300);
      await check(page, name + " " + what);
    };
    await open("artist", "Pearl Jam", "Pearl Jam page");
    const venue = await page.evaluate(() => { const b = document.querySelector("[data-venue]"); return b ? b.dataset.venue : null; });
    if (venue) await open("venue", venue, "venue page");
    const fest = await page.evaluate(() => { const b = document.querySelector("[data-fest]"); return b ? b.dataset.fest : null; });
    if (fest) await open("fest", fest, "festival page");
    const id = await page.locator("[data-open]").count() ? await page.locator("[data-open]").first().getAttribute("data-open") : null;
    if (id) await open("open", id, "concert page"); else errors.push(name + ": no concert to open");
    await page.close();
  }
  await browser.close();
  if (errors.length) { console.error("Smoke test failed:\n" + errors.join("\n")); process.exit(1); }
  console.log("Smoke test passed.");
})().catch((e) => { console.error(e); process.exit(1); });
