import { App, PluginSettingTab, Setting, Platform } from "obsidian";
import type PhonoLitePlugin from "../../main";
import { getResolvedModelPath, modelExistsOnDisk } from "../transcription/whisper";

export class PhonoLiteSettingTab extends PluginSettingTab {
	plugin: PhonoLitePlugin;

	constructor(app: App, plugin: PhonoLitePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Phonolite" });

		// ── General ─────────────────────────────────────────────────────────
		new Setting(containerEl).setName("General").setHeading();

		new Setting(containerEl)
			.setName("API key")
			.setDesc("Your Phonolite API key (pk_…). Get one at phonolite.rocks/dashboard.")
			.addText((text) =>
				text
					.setPlaceholder("pk_...")
					.setValue(this.plugin.settings.apiKey)
					.then((t) => { t.inputEl.type = "password"; })
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Server URL")
			.setDesc("Backend URL. Change only for self-hosted or staging deployments.")
			.addText((text) =>
				text
					.setPlaceholder("https://phonolite.rocks")
					.setValue(this.plugin.settings.serverUrl)
					.onChange(async (value) => {
						this.plugin.settings.serverUrl = value.trim() || "https://phonolite.rocks";
						await this.plugin.saveSettings();
					}),
			);

		// ── Transcription ────────────────────────────────────────────────────
		new Setting(containerEl).setName("Transcription").setHeading();

		if (!Platform.isMobile) {
			new Setting(containerEl)
				.setName("Model size")
				.setDesc("Tiny is faster; Base is more accurate. Changing size downloads a new model.")
				.addDropdown((dd) =>
					dd
						.addOption("tiny", "Tiny (~40 MB, faster)")
						.addOption("base", "Base (~145 MB, more accurate)")
						.setValue(this.plugin.settings.modelSize)
						.onChange(async (value) => {
							this.plugin.settings.modelSize = value as "tiny" | "base";
							await this.plugin.saveSettings();
							this.display(); // re-render to update resolved path
						}),
				);

			const resolvedPath = getResolvedModelPath(
				this.plugin.settings,
				(this.plugin.app.vault.adapter as any).getBasePath(),
			);

			new Setting(containerEl)
				.setName("Model storage path")
				.setDesc(`Resolved path: ${resolvedPath}`)
				.addText((text) =>
					text
						.setPlaceholder("(default)")
						.setValue(this.plugin.settings.modelPath)
						.onChange(async (value) => {
							this.plugin.settings.modelPath = value.trim();
							await this.plugin.saveSettings();
						}),
				)
				.addButton((btn) =>
					btn
						.setButtonText("Open folder")
						.onClick(() => {
							// Use Electron shell to open the folder
							try {
								const { shell } = require("electron");
								shell.openPath(resolvedPath);
							} catch {
								// Ignore on non-Electron environments
							}
						}),
				);

			// Model status
			const statusSetting = new Setting(containerEl).setName("Model status");
			this.updateModelStatus(statusSetting, resolvedPath);

			new Setting(containerEl)
				.setName("Force cloud transcription")
				.setDesc("Always use cloud transcription instead of the local model.")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.forceCloud)
						.onChange(async (value) => {
							this.plugin.settings.forceCloud = value;
							await this.plugin.saveSettings();
							this.plugin.statusBar.setState(
								!value && this.plugin.whisper.isReady() ? "ready-local" : "ready-cloud",
							);
						}),
				);
		}

		// ── Note Generation ──────────────────────────────────────────────────
		new Setting(containerEl).setName("Note generation").setHeading();

		new Setting(containerEl)
			.setName("Output folder")
			.setDesc("Vault-relative folder for new notes. Leave empty to save in the vault root.")
			.addText((text) =>
				text
					.setPlaceholder("e.g. Phonolite Notes")
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Recordings folder")
			.setDesc("Vault-relative folder to save raw audio recordings (.webm). Leave empty to skip saving.")
			.addText((text) =>
				text
					.setPlaceholder("e.g. phonolite/recordings")
					.setValue(this.plugin.settings.recordingsFolder)
					.onChange(async (value) => {
						this.plugin.settings.recordingsFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Transcripts folder")
			.setDesc("Vault-relative folder to save raw transcripts (.md). Leave empty to skip saving.")
			.addText((text) =>
				text
					.setPlaceholder("e.g. phonolite/transcripts")
					.setValue(this.plugin.settings.transcriptsFolder)
					.onChange(async (value) => {
						this.plugin.settings.transcriptsFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Note template")
			.setDesc(
				"Markdown template for generated notes. " +
				"Tokens: {{title}}, {{summary}}, {{sections}}, {{actionItems}}, {{tags}}, {{date}}, {{transcript}}",
			)
			.addTextArea((area) =>
				area
					.setValue(this.plugin.settings.noteTemplate)
					.onChange(async (value) => {
						this.plugin.settings.noteTemplate = value;
						await this.plugin.saveSettings();
					})
					.then((a) => {
						a.inputEl.rows = 12;
						a.inputEl.style.width = "100%";
						a.inputEl.style.fontFamily = "monospace";
					}),
			);

		new Setting(containerEl)
			.setName("Custom prompt")
			.setDesc("Optional: prepended to the default LLM system prompt to guide note generation.")
			.addTextArea((area) =>
				area
					.setPlaceholder("e.g. Always respond in Spanish.")
					.setValue(this.plugin.settings.customPrompt)
					.onChange(async (value) => {
						this.plugin.settings.customPrompt = value;
						await this.plugin.saveSettings();
					})
					.then((a) => {
						a.inputEl.rows = 4;
						a.inputEl.style.width = "100%";
					}),
			);

		// ── Tools ────────────────────────────────────────────────────────────
		new Setting(containerEl).setName("Tools").setHeading();

		new Setting(containerEl)
			.setName("Transcribe audio file")
			.setDesc("Pick an audio file from your vault and run the full pipeline: transcribe → convert → note.")
			.addButton((btn) =>
				btn.setButtonText("Transcribe audio…").onClick(() => {
					(this.plugin.app as any).setting.close();
					(this.plugin.app as any).commands.executeCommandById("phonolite:transcribe-file");
				}),
			);

		new Setting(containerEl)
			.setName("Convert transcript to note")
			.setDesc("Pick a transcript (.md) from your vault and convert it into a structured note.")
			.addButton((btn) =>
				btn.setButtonText("Convert transcript…").onClick(() => {
					(this.plugin.app as any).setting.close();
					(this.plugin.app as any).commands.executeCommandById("phonolite:convert-transcript");
				}),
			);
	}

	private updateModelStatus(setting: Setting, resolvedPath: string): void {
		const exists = modelExistsOnDisk(resolvedPath, this.plugin.settings.modelSize);

		if (this.plugin.modelDownloading) {
			setting.setDesc("⏬ Downloading...");
			return;
		}

		if (this.plugin.modelDownloadFailed) {
			setting.setDesc("⚠️ Download failed");
			setting.addButton((btn) =>
				btn.setButtonText("Retry").onClick(async () => {
					await this.plugin.downloadModelAndInit();
					this.display();
				}),
			);
			return;
		}

		if (exists) {
			setting.setDesc("✅ Ready");
		} else {
			setting.setDesc("❌ Not downloaded");
			setting.addButton((btn) =>
				btn.setButtonText("Download now").onClick(async () => {
					await this.plugin.downloadModelAndInit();
					this.display();
				}),
			);
		}
	}
}
