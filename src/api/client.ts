import { requestUrl } from "obsidian";
import { ApiError } from "../transcription/cloud";
import { warn } from "../utils/log";

export interface NotePayload {
	title: string;
	summary: string;
	sections: { heading: string; content: string }[];
	actionItems: string[];
	tags: string[];
}

export interface ConvertParams {
	apiKey: string;
	serverUrl: string;
	transcript: string;
	audioSeconds: number;
	prompt?: string;
	hash?: string;
}

export interface AckParams {
	apiKey: string;
	serverUrl: string;
	operationId: string;
	status: "success" | "error";
	// outputPath?: string;
	outputHash?: string;
	error?: string;
}

export async function callConvert(
	params: ConvertParams,
): Promise<{ payload: NotePayload; operationId: string }> {
	const body: Record<string, unknown> = {
		apiKey: params.apiKey,
		transcript: params.transcript,
		audioSeconds: params.audioSeconds,
	};
	if (params.prompt) body.prompt = params.prompt;
	if (params.hash) body.hash = params.hash;

	const attempt = async () => {
		const response = await requestUrl({
			url: `${params.serverUrl}/api/convert`,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			throw: false,
		});

		if (response.status >= 400) {
			if (response.status === 401) throw new ApiError(401, "Invalid API key");
			if (response.status === 403) throw new ApiError(403, "Usage limit reached", true);
			throw new ApiError(response.status, `Convert failed: ${response.status}`);
		}

		return response.json as { payload: NotePayload; operationId: string };
	};

	try {
		return await attempt();
	} catch (err) {
		if (err instanceof ApiError && err.status === 500) {
			await delay(2000);
			return await attempt();
		}
		throw err;
	}
}

export async function callAck(params: AckParams): Promise<void> {
	const body: Record<string, unknown> = {
		apiKey: params.apiKey,
		operationId: params.operationId,
		status: params.status,
	};
	// if (params.outputPath) body.outputPath = params.outputPath;
	if (params.outputHash) body.outputHash = params.outputHash;
	if (params.error) body.error = params.error;

	await requestUrl({
		url: `${params.serverUrl}/api/ack`,
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		throw: false,
	}).catch((err) => {
		// Ack failure is non-fatal — log and continue
		warn("/api/ack failed:", err);
	});
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
