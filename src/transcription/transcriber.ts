import { Platform } from "obsidian";
import { warn } from "../utils/log";
import type { PhonoLiteSettings } from "../settings/settings";
import { modelExistsOnDisk } from "./whisper";
import { transcribeViaCloud } from "./cloud";
import type { WhisperTranscriber } from "./whisper";

export interface TranscriptionResult {
	transcript: string;
	durationSeconds: number;
	source: "local" | "cloud";
	operationId?: string;
}

export function isLocalAvailable(
	settings: PhonoLiteSettings,
	modelPath: string,
): boolean {
	if (Platform.isMobile) return false;
	if (settings.forceCloud) return false;
	if (!modelExistsOnDisk(modelPath, settings.modelSize)) return false;
	return true;
}

export async function transcribe(
	audioBlob: Blob,
	durationSeconds: number,
	whisperTranscriber: WhisperTranscriber,
	settings: PhonoLiteSettings,
	modelPath: string,
	audioHash?: string,
): Promise<TranscriptionResult> {
	if (isLocalAvailable(settings, modelPath) && whisperTranscriber.isReady()) {
		try {
			const transcript = await whisperTranscriber.transcribeBlob(audioBlob);
			if (transcript.trim()) {
				return { transcript, durationSeconds, source: "local" };
			}
			throw new Error("Empty local transcript");
		} catch (err) {
			warn("Local transcription failed, falling back:", err);
			throw new LocalTranscriptionError(String(err));
		}
	}

	// Cloud path
	const result = await transcribeViaCloud(
		audioBlob,
		settings.apiKey,
		settings.serverUrl,
		audioHash,
	);
	return {
		transcript: result.transcript,
		durationSeconds: result.duration,
		source: "cloud",
		operationId: result.operationId,
	};
}

export class LocalTranscriptionError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = "LocalTranscriptionError";
	}
}
