// eslint-disable-next-line import/no-nodejs-modules
import { existsSync, readFileSync, writeFileSync } from "fs";
// eslint-disable-next-line import/no-nodejs-modules
import { join } from "path";
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
	private filePath: string;

	constructor(pluginDir: string) {
		this.filePath = join(pluginDir, RECORDS_FILE);
		this.records = this.loadFromDisk();
	}

	private loadFromDisk(): PipelineRecord[] {
		try {
			if (!existsSync(this.filePath)) return [];
			const raw = readFileSync(this.filePath, "utf-8");
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? (parsed as PipelineRecord[]) : [];
		} catch {
			return [];
		}
	}

	private saveToDisk(): void {
		try {
			writeFileSync(this.filePath, JSON.stringify(this.records, null, 2));
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
