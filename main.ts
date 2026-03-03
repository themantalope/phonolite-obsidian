import { Notice, Platform, Plugin, FileSystemAdapter, TFile } from "obsidian";
import { sha256Hex } from "./src/utils/hash";
import { PhonoLiteSettings, DEFAULT_SETTINGS } from "./src/settings/settings";
import { PhonoLiteSettingTab } from "./src/settings/settings-tab";
import { StatusBarManager } from "./src/ui/status-bar";
import { AudioRecorder } from "./src/audio/recorder";
import {
	WhisperTranscriber,
	getResolvedModelPath,
	modelExistsOnDisk,
	clearModelCache,
} from "./src/transcription/whisper";
import {
	isLocalAvailable,
	transcribe,
	LocalTranscriptionError,
} from "./src/transcription/transcriber";
import { transcribeViaCloud } from "./src/transcription/cloud";
import { callConvert, callAck } from "./src/api/client";
import { renderTemplate } from "./src/notes/renderer";
import { writeNote } from "./src/notes/writer";
import { askCloudFallback } from "./src/ui/fallback-modal";
import { ApiError } from "./src/transcription/cloud";
import { PipelineRecordStore, PipelineRecord } from "./src/pipeline/records";
import { ortAssetsExist, ensureOrtAssets } from "./src/transcription/ort-assets";
import { pickFile } from "./src/ui/file-suggester";
import { debug, warn } from "./src/utils/log";

export default class PhonoLitePlugin extends Plugin {
	settings: PhonoLiteSettings;

	// Exposed for settings tab to read
	modelDownloading = false;
	modelDownloadFailed = false;

	statusBar: StatusBarManager;
	private recorder = new AudioRecorder();
	whisper = new WhisperTranscriber();
	private isRecording = false;
	private records: PipelineRecordStore;

	async onload() {
		await this.loadSettings();

		this.records = new PipelineRecordStore(this.getPluginDir());

		this.statusBar = new StatusBarManager(
			this.addStatusBarItem(),
			() => {
				(this.app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting.open();
				(this.app as unknown as { setting: { openTabById(id: string): void } }).setting.openTabById(this.manifest.id);
			},
		);

		this.addSettingTab(new PhonoLiteSettingTab(this.app, this));

		this.addRibbonIcon("microphone", "Phonolite: start/stop recording", () =>
			this.toggleRecording(),
		);

		this.addCommand({
			id: "start-recording",
			name: "Start recording",
			callback: () => this.startRecording(),
		});

		this.addCommand({
			id: "stop-recording",
			name: "Stop recording",
			callback: () => this.stopRecording(),
		});

		this.addCommand({
			id: "transcribe-file",
			name: "Transcribe audio file",
			callback: () => this.transcribeFileCommand(),
		});

		this.addCommand({
			id: "convert-transcript",
			name: "Convert transcript to note",
			callback: () => this.convertTranscriptCommand(),
		});

		// Non-blocking — plugin is usable via cloud immediately
		void this.initializeLocalTranscription();
	}

	onunload() {
		if (this.isRecording) {
			this.recorder.stop().catch(() => {});
		}
		this.whisper.dispose();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<PhonoLiteSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ── Public: called from settings tab ────────────────────────────────────

	async downloadModelAndInit(): Promise<void> {
		if (Platform.isMobile) return;
		const cacheDir = this.getModelPath();
		this.modelDownloading = true;
		this.modelDownloadFailed = false;
		this.statusBar.setState("downloading");

		// Reset any previously loaded pipeline, then wipe the cache so we always
		// get a clean download (removes stale files from any previous model format).
		this.whisper.dispose();
		clearModelCache(cacheDir);

		try {
			await this.whisper.init(cacheDir, this.settings.modelSize, this.getPluginDir());
			this.statusBar.setState("ready-local");
		} catch (err) {
			warn("model download failed:", err);
			this.modelDownloadFailed = true;
			this.statusBar.setState("ready-cloud");
		} finally {
			this.modelDownloading = false;
		}
	}

	// ── Recording state machine ──────────────────────────────────────────────

	private async toggleRecording() {
		void (this.isRecording ? this.stopRecording() : this.startRecording());
	}

	private async startRecording() {
		if (this.isRecording) return;

		if (!this.settings.apiKey) {
			new Notice("Set your Phonolite API key in settings.", 4000); // eslint-disable-line obsidianmd/ui/sentence-case
			(this.app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting.open();
			(this.app as unknown as { setting: { openTabById(id: string): void } }).setting.openTabById(this.manifest.id);
			return;
		}

		try {
			await this.recorder.start();
			this.isRecording = true;
			this.statusBar.setState("recording");
		} catch {
			new Notice("Phonolite: could not access microphone.", 4000);
			this.isRecording = false;
		}
	}

	private async stopRecording() {
		if (!this.isRecording) return;
		this.isRecording = false;

		let recordingResult;
		try {
			recordingResult = await this.recorder.stop();
		} catch {
			this.statusBar.setState("error");
			return;
		}

		const { blob, durationSeconds } = recordingResult;
		const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");

		// Compute audio hash and save recording artifact
		const audioBuffer = await blob.arrayBuffer();
		const audioHash = await sha256Hex(audioBuffer);

		// Create pipeline record
		const record: PipelineRecord = {
			audioHash,
			audioSeconds: durationSeconds,
			status: "recording",
			operationIds: [],
			timestamp,
		};

		const recordingPath = await this.saveRecording(audioBuffer, timestamp);
		if (recordingPath) record.recordingPath = recordingPath;
		this.records.upsert(record);

		// Run the shared pipeline (transcribe → convert → write)
		await this.runPipeline(blob, durationSeconds, audioHash, timestamp, record);
	}

	// ── Retry commands ──────────────────────────────────────────────────────

	private async transcribeFileCommand() {
		if (!this.settings.apiKey) {
			new Notice("Set your Phonolite API key in settings.", 4000); // eslint-disable-line obsidianmd/ui/sentence-case
			return;
		}

		const file = await pickFile(
			this.app,
			["webm", "wav", "mp3", "ogg", "m4a"],
			"Select an audio file to transcribe",
		);
		if (!file) {
			new Notice("No audio files found in vault.", 3000);
			return;
		}

		await this.processAudioFile(file);
	}

	private async convertTranscriptCommand() {
		debug("convertTranscriptCommand: start");
		if (!this.settings.apiKey) {
			debug("convertTranscriptCommand: no API key");
			new Notice("Set your Phonolite API key in settings.", 4000); // eslint-disable-line obsidianmd/ui/sentence-case
			return;
		}

		const file = await pickFile(
			this.app,
			["md"],
			"Select a transcript to convert",
		);
		debug("convertTranscriptCommand: pickFile returned", file?.path ?? "null");
		if (!file) {
			const mdCount = this.app.vault.getFiles().filter((f) => f.extension === "md").length;
			debug("convertTranscriptCommand: no file selected, vault has", mdCount, "md files");
			if (mdCount === 0) {
				new Notice("No markdown files found in vault.", 3000); // eslint-disable-line obsidianmd/ui/sentence-case
			}
			return;
		}

		await this.processTranscript(file);
	}

	private async processAudioFile(file: TFile) {
		const data = await this.app.vault.readBinary(file);
		const blob = new Blob([data], { type: `audio/${file.extension}` });
		const audioHash = await sha256Hex(data);

		// Decode to get duration
		let durationSeconds: number;
		try {
			const tempCtx = new AudioContext();
			try {
				const decoded = await tempCtx.decodeAudioData(data.slice(0));
				durationSeconds = decoded.duration;
			} finally {
				await tempCtx.close();
			}
		} catch {
			// If we can't decode duration, check records or default to 0
			const existing = this.records.findByAudioHash(audioHash);
			durationSeconds = existing?.audioSeconds ?? 0;
		}

		const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");

		// Look up or create record
		let record = this.records.findByAudioHash(audioHash);
		if (record) {
			// Reset failed state for retry
			record.status = "recording";
			record.failedAt = undefined;
			record.error = undefined;
		} else {
			record = {
				audioHash,
				audioSeconds: durationSeconds,
				recordingPath: file.path,
				status: "recording",
				operationIds: [],
				timestamp,
			};
		}
		this.records.upsert(record);

		await this.runPipeline(blob, durationSeconds, audioHash, timestamp, record);
	}

	private async processTranscript(file: TFile) {
		debug("processTranscript: reading file", file.path);
		const transcript = await this.app.vault.read(file);
		debug("processTranscript: file length =", transcript.length, "chars");
		if (!transcript.trim()) {
			debug("processTranscript: file is empty");
			new Notice("Selected file is empty.", 3000);
			return;
		}

		const transcriptHash = await sha256Hex(transcript);
		debug("processTranscript: transcriptHash =", transcriptHash.slice(0, 12) + "...");

		// Look up existing record by transcript hash to find audioSeconds
		const existing = this.records.findByTranscriptHash(transcriptHash);
		const audioSeconds = existing?.audioSeconds ?? 0;
		debug("processTranscript: audioSeconds =", audioSeconds, existing ? "(from record)" : "(no record, default 0)");

		// Run convert → write pipeline (skip transcription)
		this.statusBar.setState("transcribing-cloud"); // reuse as "processing" indicator
		debug("processTranscript: calling /api/convert at", this.settings.serverUrl);

		let payload, convertOperationId: string;
		try {
			const result = await callConvert({
				apiKey: this.settings.apiKey,
				serverUrl: this.settings.serverUrl,
				transcript,
				audioSeconds,
				prompt: this.settings.customPrompt || undefined,
				hash: transcriptHash,
			});
			payload = result.payload;
			convertOperationId = result.operationId;
			debug("processTranscript: convert succeeded, operationId =", convertOperationId);
		} catch (err) {
			warn("processTranscript: convert failed", err);
			this.handleApiError(err);
			return;
		}

		// Render and write note
		const markdown = renderTemplate(
			this.settings.noteTemplate,
			payload,
			transcript,
		);
		const noteHash = await sha256Hex(markdown);

		try {
			await writeNote(
				this.app.vault,
				this.settings.outputFolder,
				payload.title,
				markdown,
			);
		} catch (err) {
			new Notice("Phonolite: failed to write note.", 4000);
			void callAck({
				apiKey: this.settings.apiKey,
				serverUrl: this.settings.serverUrl,
				operationId: convertOperationId,
				status: "error",
				error: String(err),
			});
			this.statusBar.setState("error");
			return;
		}

		void callAck({
			apiKey: this.settings.apiKey,
			serverUrl: this.settings.serverUrl,
			operationId: convertOperationId,
			status: "success",
			// outputPath,
			outputHash: noteHash,
		});

		new Notice("Note created from transcript", 3000);
		this.statusBar.setState(this.whisper.isReady() ? "ready-local" : "ready-cloud");
	}

	// ── Shared pipeline ─────────────────────────────────────────────────────

	private async runPipeline(
		blob: Blob,
		durationSeconds: number,
		audioHash: string,
		timestamp: string,
		record: PipelineRecord,
	) {
		const modelPath = this.getModelPath();
		const usingLocal = isLocalAvailable(this.settings, modelPath) && this.whisper.isReady();
		const cloudOnly = Platform.isMobile || this.settings.forceCloud;

		// On desktop without forceCloud, require explicit consent before cloud
		if (!usingLocal && !cloudOnly) {
			const choice = await askCloudFallback(this.app);
			if (choice === "discard") {
				new Notice("Recording discarded.");
				this.statusBar.setState(
					this.whisper.isReady() ? "ready-local" : "ready-cloud",
				);
				return;
			}
		}

		this.statusBar.setState(usingLocal ? "transcribing-local" : "transcribing-cloud");

		// ── Transcribe ──────────────────────────────────────────────────────
		let transcript: string;
		let audioSeconds: number;
		let transcribeOperationId: string | undefined;
		let usedCloud = !usingLocal;

		try {
			const result = await transcribe(
				blob,
				durationSeconds,
				this.whisper,
				this.settings,
				modelPath,
				audioHash,
			);
			transcript = result.transcript;
			audioSeconds = result.durationSeconds;
			transcribeOperationId = result.operationId;
			usedCloud = result.source === "cloud";
		} catch (err) {
			if (err instanceof LocalTranscriptionError) {
				const choice = await askCloudFallback(this.app);
				if (choice === "discard") {
					new Notice("Recording discarded.");
					this.statusBar.setState("ready-local");
					return;
				}

				this.statusBar.setState("transcribing-cloud");
				try {
					const cloudResult = await transcribeViaCloud(
						blob,
						this.settings.apiKey,
						this.settings.serverUrl,
						audioHash,
					);
					transcript = cloudResult.transcript;
					audioSeconds = cloudResult.duration;
					transcribeOperationId = cloudResult.operationId;
					usedCloud = true;
				} catch (cloudErr) {
					record.status = "failed";
					record.failedAt = "transcription";
					record.error = String(cloudErr);
					this.records.upsert(record);
					this.handleApiError(cloudErr);
					return;
				}
			} else {
				record.status = "failed";
				record.failedAt = "transcription";
				record.error = String(err);
				this.records.upsert(record);
				this.handleApiError(err);
				return;
			}
		}

		// Update record after transcription
		const transcriptHash = await sha256Hex(transcript);
		record.status = "transcribed";
		record.transcriptHash = transcriptHash;
		record.source = usedCloud ? "cloud" : "local";
		record.audioSeconds = audioSeconds;
		if (transcribeOperationId) record.operationIds.push(transcribeOperationId);

		const transcriptPath = await this.saveTranscript(transcript, timestamp);
		if (transcriptPath) record.transcriptPath = transcriptPath;
		this.records.upsert(record);

		// Ack the transcription if cloud
		if (transcribeOperationId) {
			void callAck({
				apiKey: this.settings.apiKey,
				serverUrl: this.settings.serverUrl,
				operationId: transcribeOperationId,
				status: "success",
			});
		}

		// ── Convert ─────────────────────────────────────────────────────────
		let payload, convertOperationId: string;
		try {
			const result = await callConvert({
				apiKey: this.settings.apiKey,
				serverUrl: this.settings.serverUrl,
				transcript,
				audioSeconds,
				prompt: this.settings.customPrompt || undefined,
				hash: transcriptHash,
			});
			payload = result.payload;
			convertOperationId = result.operationId;
		} catch (err) {
			record.status = "failed";
			record.failedAt = "conversion";
			record.error = String(err);
			this.records.upsert(record);
			this.handleApiError(err);
			return;
		}

		record.status = "converted";
		record.operationIds.push(convertOperationId);
		this.records.upsert(record);

		// ── Render + Write ──────────────────────────────────────────────────
		const markdown = renderTemplate(
			this.settings.noteTemplate,
			payload,
			transcript,
		);
		const noteHash = await sha256Hex(markdown);

		let outputPath: string;
		try {
			outputPath = await writeNote(
				this.app.vault,
				this.settings.outputFolder,
				payload.title,
				markdown,
			);
		} catch (err) {
			record.status = "failed";
			record.failedAt = "write";
			record.error = String(err);
			this.records.upsert(record);
			new Notice("Phonolite: failed to write note.", 4000);
			void callAck({
				apiKey: this.settings.apiKey,
				serverUrl: this.settings.serverUrl,
				operationId: convertOperationId,
				status: "error",
				error: String(err),
			});
			this.statusBar.setState("error");
			return;
		}

		// ── Success ─────────────────────────────────────────────────────────
		record.status = "written";
		record.notePath = outputPath;
		this.records.upsert(record);

		void callAck({
			apiKey: this.settings.apiKey,
			serverUrl: this.settings.serverUrl,
			operationId: convertOperationId,
			status: "success",
			// outputPath, - we should not be sending this back as it may contain PII, and the client doesn't need it to display or manage the note
			outputHash: noteHash,
		});

		const icon = usedCloud ? "☁️" : "💻";
		const label = usedCloud ? "Transcribed via Phonolite" : "Transcribed locally";
		new Notice(`${icon} ${label}`, 3000);
		this.statusBar.setState(usedCloud ? "ready-cloud" : "ready-local");
	}

	// ── Artifact saving ─────────────────────────────────────────────────────

	private async saveRecording(data: ArrayBuffer, timestamp: string): Promise<string | undefined> {
		const folder = this.settings.recordingsFolder.trim();
		if (!folder) return undefined;
		const path = `${folder}/${timestamp}.webm`;
		try {
			const exists = await this.app.vault.adapter.exists(folder);
			if (!exists) await this.app.vault.createFolder(folder);
			await this.app.vault.createBinary(path, data);
			return path;
		} catch (err) {
			warn("failed to save recording:", err);
			return undefined;
		}
	}

	private async saveTranscript(text: string, timestamp: string): Promise<string | undefined> {
		const folder = this.settings.transcriptsFolder.trim();
		if (!folder) return undefined;
		const path = `${folder}/${timestamp}.md`;
		try {
			const exists = await this.app.vault.adapter.exists(folder);
			if (!exists) await this.app.vault.createFolder(folder);
			await this.app.vault.create(path, text);
			return path;
		} catch (err) {
			warn("failed to save transcript:", err);
			return undefined;
		}
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	private getModelPath(): string {
		const adapter = this.app.vault.adapter as FileSystemAdapter;
		return getResolvedModelPath(this.settings, adapter.getBasePath());
	}

	private getPluginDir(): string {
		const adapter = this.app.vault.adapter as FileSystemAdapter;
		return `${adapter.getBasePath()}/.obsidian/plugins/${this.manifest.id}`;
	}

	private async initializeLocalTranscription(): Promise<void> {
		if (Platform.isMobile) {
			this.statusBar.setState("ready-cloud");
			return;
		}

		const pluginDir = this.getPluginDir();

		// Ensure ORT WASM runtime files are present (downloads from phonolite.rocks if missing)
		if (!ortAssetsExist(pluginDir)) {
			try {
				await ensureOrtAssets(pluginDir);
			} catch (err) {
				warn("ORT asset download failed, local transcription unavailable:", err);
				this.statusBar.setState("ready-cloud");
				return;
			}
		}

		const cacheDir = this.getModelPath();

		if (!modelExistsOnDisk(cacheDir, this.settings.modelSize)) {
			this.statusBar.setState("downloading");
			this.modelDownloading = true;
		}

		try {
			await this.whisper.init(cacheDir, this.settings.modelSize, pluginDir, (phase) => {
				if (phase === "downloading") {
					this.statusBar.setState("downloading");
					this.modelDownloading = true;
				}
			});
			this.statusBar.setState("ready-local");
		} catch (err) {
			warn("Whisper init failed:", err);
			if (!modelExistsOnDisk(cacheDir, this.settings.modelSize)) {
				this.modelDownloadFailed = true;
			}
			this.statusBar.setState("ready-cloud");
		} finally {
			this.modelDownloading = false;
		}
	}

	private handleApiError(err: unknown): void {
		if (err instanceof ApiError) {
			if (err.status === 401) {
				const notice = new Notice("Invalid API key — check Phonolite settings.", 0); // eslint-disable-line obsidianmd/ui/sentence-case
				notice.messageEl.addEventListener("click", () => {
					(this.app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting.open();
					(this.app as unknown as { setting: { openTabById(id: string): void } }).setting.openTabById(this.manifest.id);
					notice.hide();
				});
			} else if (err.upgradeRequired) {
				new Notice("Usage limit reached — upgrade at phonolite.rocks/#pricing", 5000);
			} else {
				new Notice(`Phonolite error: ${err.message}`, 4000);
			}
		} else {
			new Notice("Phonolite: network error. Please try again.", 4000);
		}
		this.statusBar.setState("error");
	}

}
