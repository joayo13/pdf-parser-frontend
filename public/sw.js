// Hand-written service worker (not bundled by Vite) — served as-is from /sw.js.
//
// Bump SW_VERSION whenever the precache list or fetch strategy changes below.
// This never touches the "pdf-store-*" caches owned by src/lib/pdf-store.ts —
// those are the user's saved PDFs and must survive every app-shell redeploy.
const SW_VERSION = "v1";
const PRECACHE_NAME = `app-shell-precache-${SW_VERSION}`;
const RUNTIME_NAME = `app-shell-runtime-${SW_VERSION}`;
const OWNED_CACHE_PREFIX = "app-shell-";

// Stable-path files only — the hashed Vite bundle (/assets/*.js|css) can't be
// named ahead of time by a hand-written SW, so it's runtime-cached instead.
const PRECACHE_URLS = [
	"/manifest.json",
	"/favicon.ico",
	"/logo192.png",
	"/logo512.png",
	"/pdfjs/web/viewer.html",
	"/pdfjs/web/viewer.mjs",
	"/pdfjs/web/viewer.css",
	"/pdfjs/build/pdf.mjs",
	"/pdfjs/build/pdf.worker.mjs",
	"/pdfjs/build/pdf.sandbox.mjs",
	"/pdfjs/web/locale/en-US/viewer.ftl",
];

// Populated lazily (stale-while-revalidate) rather than precached: the hashed
// Vite bundle, plus everything else under /pdfjs/** (cmaps, standard_fonts,
// iccs, wasm codecs, etc.) that a given PDF may or may not actually need.
// Exact-path precached files are matched first (see the fetch handler below),
// so this only ever catches the long tail pdf.js pulls in on demand.
const LAZY_RUNTIME_PREFIXES = ["/assets/", "/pdfjs/"];

// Cloudflare's static-asset serving 307-redirects "/foo.html" to the
// extension-less "/foo" (and pdf.js's viewer.html is requested by that exact
// .html path). A Response read via a following fetch() carries
// `redirected: true`, and Chrome refuses to fulfill a *navigation* request
// with a cached Response whose redirected flag is set — it works the first
// time as a live fetch, but silently net::ERR_FAILS once served from Cache
// Storage. Reconstructing a fresh Response strips that flag before storing.
async function toStorableResponse(response) {
	const body = await response.blob();
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(PRECACHE_NAME);
			await Promise.all(
				PRECACHE_URLS.map(async (url) => {
					const response = await fetch(url);
					await cache.put(url, await toStorableResponse(response));
				}),
			);
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter(
						(key) =>
							key.startsWith(OWNED_CACHE_PREFIX) &&
							key !== PRECACHE_NAME &&
							key !== RUNTIME_NAME,
					)
					.map((key) => caches.delete(key)),
			);
			await self.clients.claim();
		})(),
	);
});

function isLazyRuntimeAsset(pathname) {
	return LAZY_RUNTIME_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

async function cacheFirst(request, cacheName) {
	const cache = await caches.open(cacheName);
	// ignoreSearch: precached entries are keyed by pathname only, but the
	// pdf.js viewer is requested with a `?file=blob:...` query string — an
	// exact-URL match would miss (and fall through to a network fetch that
	// fails offline) without this.
	const cached = await cache.match(request, { ignoreSearch: true });
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) {
		cache.put(request, await toStorableResponse(response.clone()));
	}
	return response;
}

async function staleWhileRevalidate(request, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	const networkPromise = fetch(request)
		.then(async (response) => {
			if (response.ok)
				cache.put(request, await toStorableResponse(response.clone()));
			return response;
		})
		.catch(() => undefined);
	return cached || (await networkPromise) || fetch(request);
}

async function networkFirst(request, cacheName) {
	const cache = await caches.open(cacheName);
	try {
		const response = await fetch(request);
		if (response.ok)
			cache.put(request, await toStorableResponse(response.clone()));
		return response;
	} catch (err) {
		const cached = await cache.match(request);
		if (cached) return cached;
		throw err;
	}
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// Checked before the navigate-mode branch below: the pdf.js viewer is
	// loaded into an iframe, and a nested browsing-context navigation (like a
	// top-level one) has request.mode "navigate" — without this ordering,
	// viewer.html would always fall through to the network-first branch and
	// its precached copy would never actually be served.
	if (PRECACHE_URLS.includes(url.pathname)) {
		event.respondWith(cacheFirst(request, PRECACHE_NAME));
		return;
	}

	if (request.mode === "navigate") {
		event.respondWith(networkFirst(request, RUNTIME_NAME));
		return;
	}

	if (isLazyRuntimeAsset(url.pathname)) {
		event.respondWith(staleWhileRevalidate(request, RUNTIME_NAME));
		return;
	}
});
