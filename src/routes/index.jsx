import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({ component: App });

const VIEWER_URL = `/pdfjs/web/viewer.html`;
const PLAN_PDF_URL = "/plans/S47411 PLANS_230818_125042_260405_191111.pdf";

// TODO: replace with the real ordered plan-number list.
// Index i (0-based) here means the number appears on PDF page i + 1.
const PLAN_NUMBERS = [201, 601, 301];

const PLAN_MAPPINGS = PLAN_NUMBERS.reduce((acc, planNum, index) => {
	if (planNum) acc[planNum.toString()] = index + 1;
	return acc;
}, {});

const VIEWER_SRC = `${VIEWER_URL}?file=${encodeURIComponent(PLAN_PDF_URL)}`;

function App() {
	const [searchQuery, setSearchQuery] = useState("");
	const iframeRef = useRef(null);

	const handleSearch = (e) => {
		e.preventDefault();
		const targetPage = PLAN_MAPPINGS[searchQuery];
		if (targetPage && iframeRef.current) {
			const viewerApp = iframeRef.current.contentWindow?.PDFViewerApplication;
			if (viewerApp) {
				viewerApp.initializedPromise.then(() => {
					viewerApp.page = targetPage;
				});
			} else {
				// Fallback to URL hash if API is not immediately accessible
				iframeRef.current.src = `${VIEWER_SRC}#page=${targetPage}`;
			}
		} else if (searchQuery) {
			alert(`Plan number "${searchQuery}" not found.`);
		}
	};

	useEffect(() => {
		const request = window.indexedDB.open("TestDB", 3);

		request.onerror = (event) => {
			console.log(event);
		};

		request.onsuccess = (event) => {
			console.log(event);
		};
	}, []);

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

				<Card className="overflow-hidden bg-muted">
					<iframe
						ref={iframeRef}
						title="pdf-viewer"
						src={VIEWER_SRC}
						width="100%"
						height="800px"
						className="border-none"
					/>
				</Card>
			</div>
		</main>
	);
}
