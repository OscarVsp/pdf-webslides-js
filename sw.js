// Bumped by scripts/release.sh together with APP_VERSION in app.js. Changing this file is what
// makes browsers install the new release; it takes over once all windows of the app are closed.
const CACHE_VERSION = "1.1";
const CACHE_NAME = `pdf-webslides-${CACHE_VERSION}`;

const ASSETS = [
  "./",
  "index.html",
  "app.js",
  "styles.css",
  "manifest.json",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "vendor/pdf.min.js",
  "vendor/pdf.worker.min.js",
  "vendor/wasm/jbig2.wasm",
  "vendor/wasm/jbig2_nowasm_fallback.js",
  "vendor/wasm/openjpeg.wasm",
  "vendor/wasm/openjpeg_nowasm_fallback.js",
  "vendor/wasm/qcms_bg.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith("pdf-webslides-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Presenter and audience URLs carry ?session=...&audience=1 query parameters.
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) {
        return cached;
      }
      try {
        return await fetch(request);
      } catch (error) {
        if (request.mode === "navigate") {
          return cache.match("index.html");
        }
        throw error;
      }
    })
  );
});
