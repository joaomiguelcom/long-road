// Offline support: every file of the app is fetched from the network first (so a new deploy shows up at once)
// and kept in a cache that answers when there is no connection. version.txt always goes to the network.
const CACHE = "long-road";

// the first visit loads the page before this worker runs, so fetch the app's files once here
const FILES = ["./", "assets/app.css", "data/data.js", "upcoming.js", "extra.js", "data/discogs.js", "data/popularity.js", "img/me.jpg"];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) =>
    fetch(f, { cache: "reload" }).then((res) => res.ok && c.put(new URL(f, location).href, res)).catch(() => {})))));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("/version.txt")) return;
  // files carry ?v=<build>; keep one copy per file, whatever the build
  const key = url.origin + url.pathname;
  e.respondWith(
    // pages are checked with the server every time (a quick "not modified" when nothing changed), so a new deploy shows up on reload
    // (a navigation request cannot be re-sent with options, so it goes by URL)
    (e.request.mode === "navigate" ? fetch(e.request.url, { cache: "no-cache" }) : fetch(e.request)).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key).then((hit) => hit || Promise.reject(new Error("offline"))))
  );
});
