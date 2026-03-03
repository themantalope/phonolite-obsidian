// eslint-disable-next-line import/no-nodejs-modules
import { existsSync, writeFileSync, mkdirSync } from "fs";
// eslint-disable-next-line import/no-nodejs-modules
import { join, dirname } from "path";
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
	return ORT_FILES.every((f) => existsSync(join(pluginDir, f)));
}

/** Downloads any missing ORT WASM files from phonolite.rocks to pluginDir. */
export async function ensureOrtAssets(pluginDir: string): Promise<void> {
	mkdirSync(pluginDir, { recursive: true });

	for (const file of ORT_FILES) {
		const dest = join(pluginDir, file);
		if (existsSync(dest)) continue;

		debug("Downloading ORT asset:", file);
		const url = `${ORT_BASE_URL}/${file}`;
		const response = await requestUrl({ url });
		mkdirSync(dirname(dest), { recursive: true });
		// eslint-disable-next-line no-undef
		writeFileSync(dest, Buffer.from(response.arrayBuffer));
		debug("Saved ORT asset:", file);
	}
}
