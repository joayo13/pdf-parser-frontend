import type { ChangeEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PdfEntryMeta } from "@/lib/pdf-store";

interface PdfSwitcherProps {
	entries: PdfEntryMeta[];
	selectedId: string;
	onSelect: (id: string) => void;
	onAdd: (file: File) => Promise<void>;
}

export function PdfSwitcher({
	entries,
	selectedId,
	onSelect,
	onAdd,
}: PdfSwitcherProps) {
	const [isAdding, setIsAdding] = useState(false);

	const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;

		setIsAdding(true);
		try {
			await onAdd(file);
			toast.success(`Added "${file.name}"`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to add PDF");
		} finally {
			setIsAdding(false);
		}
	};

	return (
		<Card className="gap-2 p-3">
			<div className="flex flex-col gap-1.5">
				{entries.map((entry) => (
					<div key={entry.id} className="flex items-center gap-2">
						<Button
							type="button"
							variant={entry.id === selectedId ? "default" : "outline"}
							size="sm"
							className="flex-1 justify-start"
							onClick={() => onSelect(entry.id)}
						>
							{entry.name}
						</Button>
						{entry.isOriginal && <Badge variant="secondary">Original</Badge>}
					</div>
				))}
			</div>

			<div className="flex items-center gap-2">
				<Input
					type="file"
					accept="application/pdf"
					disabled={isAdding}
					onChange={handleFileChange}
					className="text-xs"
				/>
			</div>
		</Card>
	);
}
