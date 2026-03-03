import { App, Modal } from "obsidian";

export type FallbackChoice = "cloud" | "discard";

export class CloudFallbackModal extends Modal {
	private resolve: (choice: FallbackChoice) => void;

	constructor(app: App, resolve: (choice: FallbackChoice) => void) {
		super(app);
		this.resolve = resolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Local transcription failed" });
		contentEl.createEl("p", {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			text: "Send the recording to Phonolite cloud for transcription?",
		});
		contentEl.createEl("p", {
			cls: "phonolite-fallback-note",
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			text: "Your audio will be sent to the Phonolite server.",
		});

		const buttonRow = contentEl.createDiv({ cls: "phonolite-button-row" });

		const cloudBtn = buttonRow.createEl("button", { text: "Send to cloud" });
		cloudBtn.addClass("mod-cta");
		cloudBtn.addEventListener("click", () => {
			this.resolve("cloud");
			this.close();
		});

		const discardBtn = buttonRow.createEl("button", { text: "Discard" });
		discardBtn.addEventListener("click", () => {
			this.resolve("discard");
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function askCloudFallback(app: App): Promise<FallbackChoice> {
	return new Promise((resolve) => {
		new CloudFallbackModal(app, resolve).open();
	});
}
