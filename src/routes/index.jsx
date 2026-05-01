import { createFileRoute } from "@tanstack/react-router";
import {
	CheckCircle2,
	Loader2,
	Navigation,
	Search,
	Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({ component: App });

const VIEWER_URL = `/pdfjs/web/viewer.html`;

function App() {
	const [file, setFile] = useState(null);
	const [isUploading, setIsUploading] = useState(false);
	const [planMappings, setPlanMappings] = useState({});
	const [searchQuery, setSearchQuery] = useState("");
	const [status, setStatus] = useState("");
	const iframeRef = useRef(null);

	// Load mappings from localStorage on mount
	useEffect(() => {
		const savedMappings = localStorage.getItem("pdfPlanMappings");
		if (savedMappings) {
			try {
				setPlanMappings(JSON.parse(savedMappings));
			} catch (e) {
				console.error("Failed to parse saved mappings", e);
			}
		}
	}, []);

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!file) return;

		setIsUploading(true);
		setStatus("Analyzing PDF (this may take a few minutes)...");

		const formData = new FormData();
		formData.append("file", file);

		try {
			const response = await fetch("https://plan-viewer.onrender.com/api", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) throw new Error("Upload failed");

			const result = await response.json();
			// Result format: { "data": [201, 601, ...] }
			if (result.data && Array.isArray(result.data)) {
				const mappings = {};
				result.data.forEach((planNum, index) => {
					// map plan number to 1-indexed page number
					if (planNum) {
						mappings[planNum.toString()] = index + 1;
					}
				});
				setPlanMappings(mappings);
				toast("Plan numbers mapped successfully.");
				localStorage.setItem("pdfPlanMappings", JSON.stringify(mappings));
				setStatus("Plan numbers mapped successfully!");
			}
		} catch (error) {
			console.error("Upload error:", error);
			setStatus("Error uploading or processing PDF.");
		} finally {
			setIsUploading(false);
		}
	};

	const handleSearch = (e) => {
		toast("TEst");
		e.preventDefault();
		const targetPage = planMappings[searchQuery];
		if (targetPage && iframeRef.current) {
			const viewerApp = iframeRef.current.contentWindow?.PDFViewerApplication;
			if (viewerApp) {
				viewerApp.page = targetPage;
			} else {
				// Fallback to URL hash if API is not immediately accessible
				iframeRef.current.src = `${VIEWER_URL}#page=${targetPage}`;
			}
		} else if (searchQuery) {
			alert(`Plan number "${searchQuery}" not found.`);
		}
	};

	return (
		<main className="container mx-auto py-10 flex flex-col gap-8">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl font-bold">Plan Search</CardTitle>
					<CardDescription>
						Upload your plans pdf to enable searching by plan number.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form
						onSubmit={handleSubmit}
						className="flex flex-wrap items-end gap-4"
					>
						<div className="grid w-full max-w-sm items-center gap-1.5">
							<Label htmlFor="pdf-upload">PDF File</Label>
							<Input
								id="pdf-upload"
								type="file"
								accept=".pdf"
								onChange={(e) => setFile(e.target.files?.[0])}
							/>
						</div>
						<Button
							type="submit"
							disabled={!file || isUploading}
							className="flex gap-2"
						>
							{isUploading ? (
								<>
									<Loader2 className="w-5 h-5 animate-spin" />
									Processing...
								</>
							) : (
								<>
									<Upload className="w-5 h-5" />
									Map Plans
								</>
							)}
						</Button>
					</form>

					{status && (
						<p className="text-sm font-medium text-muted-foreground animate-pulse">
							{status}
						</p>
					)}
				</CardContent>
			</Card>

			<div className="space-y-4">
				<div>
					{Object.keys(planMappings).length > 0 && (
						<form
							onSubmit={handleSearch}
							className="flex items-center gap-2 w-fit mx-auto"
						>
							<div className="relative mx-auto">
								<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									type="text"
									placeholder="Quick go to plan..."
									disabled={isUploading}
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="pl-8 w-40"
								/>
							</div>
							<Button type="submit" size="sm" disabled={isUploading}>
								Go
							</Button>
						</form>
					)}
				</div>

				<Card className="overflow-hidden bg-muted">
					<iframe
						ref={iframeRef}
						title="pdf-viewer"
						src={VIEWER_URL}
						width="100%"
						height="800px"
						className="border-none"
					/>
				</Card>
			</div>
		</main>
	);
}
