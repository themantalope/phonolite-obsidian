export interface CloudTranscriptionResult {
	transcript: string;
	duration: number;
	operationId: string;
}

export async function transcribeViaCloud(
	audioBlob: Blob,
	apiKey: string,
	serverUrl: string,
	audioHash?: string,
): Promise<CloudTranscriptionResult> {
	const form = new FormData();
	form.append("apiKey", apiKey);
	form.append("audio", audioBlob, "recording.webm");
	if (audioHash) form.append("hash", audioHash);

	const response = await fetch(`${serverUrl}/api/transcribe`, {
		method: "POST",
		body: form,
	});

	if (!response.ok) {
		const body = await response.json().catch(() => ({})) as Record<string, unknown>;
		if (response.status === 401) throw new ApiError(401, "Invalid API key");
		if (response.status === 403) throw new ApiError(403, "Usage limit reached", true);
		throw new ApiError(response.status, `Transcription failed: ${response.status}`);
	}

	const data = await response.json() as CloudTranscriptionResult;
	return data;
}

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly upgradeRequired = false,
	) {
		super(message);
		this.name = "ApiError";
	}
}
