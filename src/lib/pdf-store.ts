// Cache Storage-backed multi-PDF store — the IndexedDB replacement.
// Kept in its own cache ("pdf-store-v1"), separate from the service worker's
// "app-shell-*" caches, so an app-shell redeploy's cache cleanup never
// touches saved PDFs. See public/sw.js for that side of the split.

export interface PdfEntryMeta {
	id: string;
	name: string;
	createdAt: string;
	parentId: string | null;
	isOriginal: boolean;
	size: number;
	contentType: string;
}

interface PdfStoreManifest {
	version: 1;
	entries: PdfEntryMeta[];
}

export interface SavePdfInput {
	id?: string;
	name: string;
	blob: Blob;
	parentId?: string | null;
}

const CACHE_NAME = "pdf-store-v1";
const MANIFEST_KEY = "/__pdf-store/manifest.json";
const BLOB_KEY_PREFIX = "/__pdf-store/blob/";
export const ORIGINAL_PDF_ID = "original";

function blobKey(id: string): string {
	return `${BLOB_KEY_PREFIX}${id}`;
}

async function readManifest(cache: Cache): Promise<PdfStoreManifest> {
	const response = await cache.match(MANIFEST_KEY);
	if (!response) return { version: 1, entries: [] };
	return (await response.json()) as PdfStoreManifest;
}

async function writeManifest(
	cache: Cache,
	manifest: PdfStoreManifest,
): Promise<void> {
	await cache.put(
		MANIFEST_KEY,
		new Response(JSON.stringify(manifest), {
			headers: { "Content-Type": "application/json" },
		}),
	);
}

export async function listPdfs(): Promise<PdfEntryMeta[]> {
	const cache = await caches.open(CACHE_NAME);
	const manifest = await readManifest(cache);
	return [...manifest.entries].sort((a, b) => {
		if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
		return a.createdAt.localeCompare(b.createdAt);
	});
}

export async function getPdf(
	id: string,
): Promise<{ meta: PdfEntryMeta; blob: Blob } | null> {
	const cache = await caches.open(CACHE_NAME);
	const manifest = await readManifest(cache);
	const meta = manifest.entries.find((entry) => entry.id === id);
	if (!meta) return null;

	const blobResponse = await cache.match(blobKey(id));
	if (!blobResponse) return null;

	return { meta, blob: await blobResponse.blob() };
}

export async function savePdf({
	id,
	name,
	blob,
	parentId = null,
}: SavePdfInput): Promise<PdfEntryMeta> {
	const cache = await caches.open(CACHE_NAME);
	const manifest = await readManifest(cache);
	const entryId = id ?? crypto.randomUUID();
	const contentType = blob.type || "application/pdf";

	const meta: PdfEntryMeta = {
		id: entryId,
		name,
		createdAt: new Date().toISOString(),
		parentId,
		isOriginal: entryId === ORIGINAL_PDF_ID,
		size: blob.size,
		contentType,
	};

	await cache.put(
		blobKey(entryId),
		new Response(blob, { headers: { "Content-Type": contentType } }),
	);

	const nextEntries = [
		...manifest.entries.filter((entry) => entry.id !== entryId),
		meta,
	];
	await writeManifest(cache, { version: 1, entries: nextEntries });

	return meta;
}

export async function deletePdf(id: string): Promise<void> {
	if (id === ORIGINAL_PDF_ID) {
		throw new Error("The original plan set cannot be deleted.");
	}

	const cache = await caches.open(CACHE_NAME);
	const manifest = await readManifest(cache);
	await cache.delete(blobKey(id));
	await writeManifest(cache, {
		version: 1,
		entries: manifest.entries.filter((entry) => entry.id !== id),
	});
}

// Idempotent: fetches the auto-provided PDF and stores it under the fixed
// "original" id the first time it's called; subsequent calls are a no-op
// read, so this is safe to call unconditionally on every app load.
export async function ensureOriginalSeeded(
	pdfUrl: string,
): Promise<PdfEntryMeta> {
	const existing = await getPdf(ORIGINAL_PDF_ID);
	if (existing) return existing.meta;

	const response = await fetch(pdfUrl);
	if (!response.ok) {
		throw new Error(`Failed to fetch original PDF (${response.status})`);
	}

	return savePdf({
		id: ORIGINAL_PDF_ID,
		name: "Original Plan Set",
		blob: await response.blob(),
		parentId: null,
	});
}
