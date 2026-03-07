import { warn } from "../utils/log";

export interface PipelineRecord {
	audioHash: string;
	audioSeconds: number;
	transcriptHash?: string;
	source?: "local" | "cloud";
	recordingPath?: string;
	transcriptPath?: string;
	notePath?: string;
	status: "recording" | "transcribed" | "converted" | "written" | "failed";
	failedAt?: "transcription" | "conversion" | "write";
	error?: string;
	operationIds: string[];
	timestamp: string;
}

const RECORDS_FILE = "records.json";

export class PipelineRecordStore {
	private records: PipelineRecord[] = [];
	private filePath = "";
	private hasFs = false;

	constructor(pluginDir: string) {
		if (!pluginDir) return; // mobile: in-memory only
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const nodePath = require("path") as typeof import("path");
			this.filePath = nodePath.join(pluginDir, RECORDS_FILE);
			this.hasFs = true;
			this.records = this.loadFromDisk();
		} catch {
			// Mobile: Node.js path module unavailable — run in-memory only
		}
	}

	private loadFromDisk(): PipelineRecord[] {
		if (!this.hasFs) return [];
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const nodeFs = require("fs") as typeof import("fs");
			if (!nodeFs.existsSync(this.filePath)) return [];
			const raw = nodeFs.readFileSync(this.filePath, "utf-8");
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? (parsed as PipelineRecord[]) : [];
		} catch {
			return [];
		}
	}

	private saveToDisk(): void {
		if (!this.hasFs) return;
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const nodeFs = require("fs") as typeof import("fs");
			nodeFs.writeFileSync(this.filePath, JSON.stringify(this.records, null, 2));
		} catch (err) {
			warn("Failed to save records:", err);
		}
	}

	getAll(): PipelineRecord[] {
		return this.records;
	}

	findByAudioHash(hash: string): PipelineRecord | undefined {
		return this.records.find((r) => r.audioHash === hash);
	}

	findByTranscriptHash(hash: string): PipelineRecord | undefined {
		return this.records.find((r) => r.transcriptHash === hash);
	}

	upsert(record: PipelineRecord): void {
		const idx = this.records.findIndex(
			(r) => r.audioHash === record.audioHash,
		);
		if (idx !== -1) {
			this.records[idx] = record;
		} else {
			this.records.push(record);
		}
		this.saveToDisk();
	}
}
