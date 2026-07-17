import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PdfSwitcher } from "@/components/pdf-switcher";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	ensureOriginalSeeded,
	getPdf,
	listPdfs,
	ORIGINAL_PDF_ID,
	type PdfEntryMeta,
	savePdf,
} from "@/lib/pdf-store";

export const Route = createFileRoute("/")({ component: App, ssr: false });

const VIEWER_URL = "/pdfjs/web/viewer.html";
const PLAN_PDF_URL = "/plans/S47411 PLANS_230818_125042_260405_191111.pdf";

// TODO: replace with the real ordered plan-number list.
// Index i (0-based) here means the number appears on PDF page i + 1.
const PLAN_NUMBERS = [201, 601, 301];

const PLAN_MAPPINGS = PLAN_NUMBERS.reduce<Record<string, number>>(
	(acc, planNum, index) => {
		if (planNum) acc[planNum.toString()] = index + 1;
		return acc;
	},
	{},
);

interface PdfViewerWindow extends Window {
	PDFViewerApplication?: {
		initializedPromise: Promise<void>;
		page: number;
	};
}

function App() {
	const [searchQuery, setSearchQuery] = useState("");
	const iframeRef = useRef<HTMLIFrameElement>(null);

	const [entries, setEntries] = useState<PdfEntryMeta[]>([]);
	const [selectedId, setSelectedId] = useState(ORIGINAL_PDF_ID);
	const [isSeeded, setIsSeeded] = useState(false);
	const [objectUrl, setObjectUrl] = useState<string | null>(null);

	const refreshEntries = useCallback(async () => {
		setEntries(await listPdfs());
	}, []);

	// Seed the auto-provided original PDF into the store once so it
	// participates in the same list/switch/offline path as any custom set.
	useEffect(() => {
		ensureOriginalSeeded(PLAN_PDF_URL)
			.then(() => refreshEntries())
			.catch((error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to load the original plan set",
				);
			})
			.finally(() => setIsSeeded(true));
	}, [refreshEntries]);

	useEffect(() => {
		if (!isSeeded) return;

		let cancelled = false;
		let currentUrl: string | null = null;

		getPdf(selectedId).then((result) => {
			if (cancelled || !result) return;
			currentUrl = URL.createObjectURL(result.blob);
			setObjectUrl(currentUrl);
		});

		return () => {
			cancelled = true;
			if (currentUrl) URL.revokeObjectURL(currentUrl);
		};
	}, [selectedId, isSeeded]);

	const viewerSrc = objectUrl
		? `${VIEWER_URL}?file=${encodeURIComponent(objectUrl)}`
		: null;

	const handleSearch = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const targetPage = PLAN_MAPPINGS[searchQuery];
		if (targetPage && iframeRef.current && viewerSrc) {
			const viewerApp = (
				iframeRef.current.contentWindow as PdfViewerWindow | null
			)?.PDFViewerApplication;
			if (viewerApp) {
				viewerApp.initializedPromise.then(() => {
					viewerApp.page = targetPage;
				});
			} else {
				// Fallback to URL hash if API is not immediately accessible
				iframeRef.current.src = `${viewerSrc}#page=${targetPage}`;
			}
		} else if (searchQuery) {
			alert(`Plan number "${searchQuery}" not found.`);
		}
	};

	const handleAdd = async (file: File) => {
		await savePdf({ name: file.name, blob: file, parentId: null });
		await refreshEntries();
	};

	return (
		<main className="container mx-auto py-10 flex flex-col gap-8">
			<div className="space-y-4">
				<div>
					{Object.keys(PLAN_MAPPINGS).length > 0 && (
						<form
							onSubmit={handleSearch}
							className="flex items-center gap-2 w-fit mx-auto"
						>
							<div className="relative mx-auto">
								<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									type="text"
									placeholder="Quick go to plan..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="pl-8 w-40"
								/>
							</div>
							<Button type="submit" size="sm">
								Go
							</Button>
						</form>
					)}
				</div>

				<PdfSwitcher
					entries={entries}
					selectedId={selectedId}
					onSelect={setSelectedId}
					onAdd={handleAdd}
				/>

				<Card className="overflow-hidden bg-muted">
					{viewerSrc ? (
						<iframe
							ref={iframeRef}
							title="pdf-viewer"
							src={viewerSrc}
							width="100%"
							height="800px"
							className="border-none"
						/>
					) : (
						<div className="flex h-200 items-center justify-center text-sm text-muted-foreground">
							Loading plan set...
						</div>
					)}
				</Card>
			</div>
		</main>
	);
}
