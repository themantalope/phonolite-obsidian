export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
	const buffer =
		typeof data === "string"
			? new TextEncoder().encode(data).buffer as ArrayBuffer
			: data;
	const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
