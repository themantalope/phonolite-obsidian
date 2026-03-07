import { requestUrl } from "obsidian";

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
	// Build multipart/form-data body manually — requestUrl doesn't support FormData.
	const boundary = "----PhonoliteBoundary" + Math.random().toString(36).slice(2);
	const CRLF = "\r\n";
	const enc = new TextEncoder();

	const textPart = (name: string, value: string): Uint8Array =>
		enc.encode(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`);

	const audioPart = new Uint8Array(await audioBlob.arrayBuffer());
	const audioHeader = enc.encode(
		`--${boundary}${CRLF}Content-Disposition: form-data; name="audio"; filename="recording.webm"${CRLF}Content-Type: audio/webm${CRLF}${CRLF}`,
	);
	const audioCRLF = enc.encode(CRLF);

	const parts: Uint8Array[] = [textPart("apiKey", apiKey), audioHeader, audioPart, audioCRLF];
	if (audioHash) parts.push(textPart("hash", audioHash));
	parts.push(enc.encode(`--${boundary}--${CRLF}`));

	const totalLength = parts.reduce((n, p) => n + p.byteLength, 0);
	const body = new Uint8Array(totalLength);
	let offset = 0;
	for (const part of parts) { body.set(part, offset); offset += part.byteLength; }

	const response = await requestUrl({
		url: `${serverUrl}/api/transcribe`,
		method: "POST",
		contentType: `multipart/form-data; boundary=${boundary}`,
		body: body.buffer,
		throw: false,
	});

	if (response.status >= 400) {
		if (response.status === 401) throw new ApiError(401, "Invalid API key");
		if (response.status === 403) throw new ApiError(403, "Usage limit reached", true);
		throw new ApiError(response.status, `Transcription failed: ${response.status}`);
	}

	return response.json as CloudTranscriptionResult;
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
