import { App, FuzzySuggestModal, TFile } from "obsidian";

class FileSuggester extends FuzzySuggestModal<TFile> {
	private files: TFile[];
	private chosen: TFile | null = null;
	private onDone: (file: TFile | null) => void;

	constructor(app: App, files: TFile[], onDone: (file: TFile | null) => void) {
		super(app);
		this.files = files;
		this.onDone = onDone;
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.chosen = file;
	}

	onClose(): void {
		// Defer so onChooseItem fires first (Obsidian calls onClose before onChooseItem)
		setTimeout(() => this.onDone(this.chosen), 0);
	}
}

export function pickFile(
	app: App,
	extensions: string[],
	placeholder?: string,
): Promise<TFile | null> {
	const extSet = new Set(extensions.map((e) => e.toLowerCase()));
	const files = app.vault
		.getFiles()
		.filter((f) => extSet.has(f.extension.toLowerCase()));

	if (files.length === 0) return Promise.resolve(null);

	return new Promise((resolve) => {
		const modal = new FileSuggester(app, files, resolve);
		if (placeholder) modal.setPlaceholder(placeholder);
		modal.open();
	});
}
