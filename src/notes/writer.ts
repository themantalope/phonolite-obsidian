import type { Vault } from "obsidian";

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

function sanitizeFilename(name: string): string {
	return name.replace(INVALID_FILENAME_CHARS, "-").trim().slice(0, 100);
}

export async function writeNote(
	vault: Vault,
	outputFolder: string,
	title: string,
	content: string,
): Promise<string> {
	const folder = outputFolder.trim();

	if (folder) {
		const exists = await vault.adapter.exists(folder);
		if (!exists) await vault.createFolder(folder);
	}

	const base = sanitizeFilename(title) || "Phonolite Note";
	let filePath = folder ? `${folder}/${base}.md` : `${base}.md`;

	// Handle collisions
	let suffix = 2;
	while (await vault.adapter.exists(filePath)) {
		filePath = folder
			? `${folder}/${base} (${suffix}).md`
			: `${base} (${suffix}).md`;
		suffix++;
	}

	await vault.create(filePath, content);
	return filePath;
}
