import { requestUrl } from "obsidian";
import { debug } from "../utils/log";

const ORT_BASE_URL = "https://phonolite.rocks/ort";

const ORT_FILES = [
	"ort-wasm-simd-threaded.wasm",
	"ort-wasm-simd-threaded.mjs",
	"ort-wasm-simd-threaded.jsep.mjs",
	"ort-wasm-simd-threaded.jsep.wasm",
] as const;

/** Returns true if all 4 ORT WASM files exist in pluginDir. */
export function ortAssetsExist(pluginDir: string): boolean {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const nodeFs = require("fs") as typeof import("fs");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const nodePath = require("path") as typeof import("path");
	return ORT_FILES.every((f) => nodeFs.existsSync(nodePath.join(pluginDir, f)));
}

/** Downloads any missing ORT WASM files from phonolite.rocks to pluginDir. */
export async function ensureOrtAssets(pluginDir: string): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const nodeFs = require("fs") as typeof import("fs");
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const nodePath = require("path") as typeof import("path");

	nodeFs.mkdirSync(pluginDir, { recursive: true });

	for (const file of ORT_FILES) {
		const dest = nodePath.join(pluginDir, file);
		if (nodeFs.existsSync(dest)) continue;

		debug("Downloading ORT asset:", file);
		const url = `${ORT_BASE_URL}/${file}`;
		const response = await requestUrl({ url });
		nodeFs.mkdirSync(nodePath.dirname(dest), { recursive: true });
		nodeFs.writeFileSync(dest, new Uint8Array(response.arrayBuffer));
		debug("Saved ORT asset:", file);
	}
}
