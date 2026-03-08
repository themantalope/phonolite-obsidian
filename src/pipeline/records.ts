import type { DataAdapter } from "obsidian";
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

export class PipelineRecordStore {
	private records: PipelineRecord[] = [];

	constructor(
		private adapter: DataAdapter,
		private filePath: string,
	) {}

	async load(): Promise<void> {
		try {
			if (!(await this.adapter.exists(this.filePath))) return;
			const raw = await this.adapter.read(this.filePath);
			const parsed: unknown = JSON.parse(raw);
			this.records = Array.isArray(parsed) ? (parsed as PipelineRecord[]) : [];
		} catch {
			this.records = [];
		}
	}

	private saveToDisk(): void {
		const dir = this.filePath.substring(0, this.filePath.lastIndexOf("/"));
		void this.adapter
			.mkdir(dir)
			.catch(() => { /* directory likely exists */ })
			.then(() => this.adapter.write(this.filePath, JSON.stringify(this.records, null, 2)))
			.catch((err) => warn("Failed to save records:", err));
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
