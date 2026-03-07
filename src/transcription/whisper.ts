import { pipeline, env } from "@huggingface/transformers";
import type { AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import type { PhonoLiteSettings } from "../settings/settings";
import { debug, warn } from "../utils/log";

const MODEL_IDS = {
	tiny: "onnx-community/whisper-tiny.en",
	base: "onnx-community/whisper-base.en",
} as const;

// Disk-backed cache implementing the Web Cache API interface (match + put).
// transformers.js's built-in FileCache relies on node:fs which is shimmed empty
// in the browser bundle that esbuild resolves. This custom cache uses our own fs
// import (bare "fs", properly externalized) and is injected via env.customCache
// which transformers.js checks before browser cache or FileCache.
class DiskCache {
	constructor(private basePath: string) {}

	private urlToPath(key: string): string {
		try {
			const url = new URL(key);
			// e.g. /onnx-community/whisper-tiny.en/resolve/main/onnx/model.onnx
			const parts = url.pathname.split("/").filter(Boolean);
			const resolveIdx = parts.indexOf("resolve");
			if (resolveIdx !== -1) {
				// Strip "resolve/{revision}" to get: org/model/file
				const before = parts.slice(0, resolveIdx);
				const after = parts.slice(resolveIdx + 2);
				return join(this.basePath, ...before, ...after);
			}
			return join(this.basePath, ...parts);
		} catch {
			// Not a URL — treat as relative path
			return join(this.basePath, key);
		}
	}

	match(request: string): Promise<Response | undefined> {
		const filePath = this.urlToPath(request);
		if (!existsSync(filePath)) return Promise.resolve(undefined);

		const data = readFileSync(filePath);
		const headers = new Headers();
		headers.set("content-length", statSync(filePath).size.toString());
		return Promise.resolve(new Response(data, { status: 200, headers }));
	}

	async put(request: string, response: Response): Promise<void> {
		const filePath = this.urlToPath(request);
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, new Uint8Array(await response.arrayBuffer()));
	}
}

function configureEnv(cacheDir: string, allowRemote: boolean, pluginDir: string): void {
	env.cacheDir = cacheDir;
	env.allowLocalModels = true;
	env.allowRemoteModels = allowRemote;
	// Bypass both browser Cache API and built-in FileCache (which needs node:fs).
	// Our DiskCache writes to the same paths that modelExistsOnDisk() checks.
	// These are undocumented transformers.js env flags — cast through Record to avoid any.
	const envExt = env as Record<string, unknown>;
	envExt.useCustomCache = true;
	envExt.customCache = new DiskCache(cacheDir);
	envExt.useBrowserCache = false;
	envExt.useFSCache = false;
	applyOrtConfig(pluginDir);
}

let ortConfigApplied = false;
function applyOrtConfig(pluginDir: string): void {
	if (ortConfigApplied) return;
	ortConfigApplied = true;

	// onnxruntime-web always loads "ort-wasm-simd-threaded.jsep.mjs" (JSEP variant,
	// hardcoded in ort.min.mjs). It reads wasmPaths via the short key "mjs" (not the
	// full filename) and reads wasmBinary directly from flags.wasmBinary.
	//
	// Electron renderer (app://obsidian.md) blocks dynamic import() of file:// URLs,
	// so we serve the JSEP .mjs as a blob: URL. The blob: URL has empty base path, so
	// relative .wasm resolution fails — we pre-load the JSEP .wasm binary instead so
	// ORT passes it directly as moduleArg.wasmBinary (bypasses URL fetching entirely).

	let mjsBlobUrl: string | undefined;
	let jsepWasmBlobUrl: string | undefined;

	try {
		// Read as text so we can patch the isNode check before creating the blob URL.
		// The JSEP .mjs has top-level code:
		//   var isNode = typeof globalThis.process?.versions?.node == 'string';
		//   if (isNode) isPthread = (await import('worker_threads'))...
		// In Electron renderer, process.versions.node is a string → isNode = true →
		// import('worker_threads') fires, but blob: URLs run as browser ESM and have
		// no Node.js module resolution → TypeError: Failed to resolve module specifier.
		// Fix: add process.type !== 'renderer' guard to the isNode check.
		let mjsText = readFileSync(join(pluginDir, "ort-wasm-simd-threaded.jsep.mjs"), "utf-8");
		mjsText = mjsText.replace(
			"var isNode = typeof globalThis.process?.versions?.node == 'string';",
			"var isNode = typeof globalThis.process?.versions?.node == 'string' && globalThis.process?.type !== 'renderer';",
		);
		mjsBlobUrl = URL.createObjectURL(new Blob([mjsText], { type: "text/javascript" }));
	} catch (e) {
		warn("ORT blob URL failed for jsep.mjs:", e);
	}

	try {
		// Provide JSEP .wasm as a blob URL (not as a pre-loaded binary).
		// The JSEP .mjs checks e.locateFile first to find the .wasm URL, then falls
		// back to new URL("...jsep.wasm", import.meta.url). When import.meta.url is a
		// blob: URL with Obsidian's custom app:// origin, that new URL() call throws
		// "Invalid URL". Setting wasmPaths.wasm causes ORT runtime to set:
		//   y.locateFile = g => jsepWasmBlobUrl
		// which the JSEP module uses directly — no URL constructor needed.
		const wasmData = readFileSync(join(pluginDir, "ort-wasm-simd-threaded.jsep.wasm"));
		jsepWasmBlobUrl = URL.createObjectURL(new Blob([wasmData], { type: "application/wasm" }));
	} catch (e) {
		warn("ORT blob URL failed for jsep.wasm:", e);
	}

	interface OnnxWasmConfig { numThreads?: number; proxy?: boolean; wasmPaths?: Record<string, string> }
	interface OnnxBackend { wasm?: OnnxWasmConfig }
	interface OnnxEnvLike { onnx?: OnnxBackend }

	const backends = env.backends as unknown as OnnxEnvLike;
	const onnxEnv = backends?.onnx;

	const applyConfig = (onnx: OnnxBackend) => {
		if (onnx?.wasm) {
			onnx.wasm.numThreads = 1;
			onnx.wasm.proxy = false;
			// wasmPaths keys confirmed by reading ort.min.mjs: o?.mjs and o?.wasm
			// Setting .wasm causes ORT to set locateFile = g => wasm_blob_url,
			// which prevents the JSEP module from trying new URL(..., blob:app://...).
			const wasmPaths: Record<string, string> = {};
			if (mjsBlobUrl) wasmPaths.mjs = mjsBlobUrl;
			if (jsepWasmBlobUrl) wasmPaths.wasm = jsepWasmBlobUrl;
			if (Object.keys(wasmPaths).length > 0) onnx.wasm.wasmPaths = wasmPaths;
		}
	};

	if (onnxEnv) {
		applyConfig(onnxEnv);
	} else {
		// Fallback: intercept via Proxy in case the onnx backend is assigned lazily.
		env.backends = new Proxy(backends ?? {}, {
			set(target, prop, value) {
				if (prop === "onnx") applyConfig(value as OnnxBackend);
				return Reflect.set(target, prop, value);
			},
		}) as unknown as typeof env.backends;
	}
}

export function getResolvedModelPath(
	settings: PhonoLiteSettings,
	vaultBasePath: string,
): string {
	if (settings.modelPath) return settings.modelPath;
	return `${vaultBasePath}/.obsidian/plugins/phonolite/models`;
}

export function modelExistsOnDisk(
	cacheDir: string,
	modelSize: "tiny" | "base",
): boolean {
	// transformers.js FileCache stores files using pathJoin(modelId, filename) as
	// the cache key (hub.js: requestURL = pathJoin(path_or_repo_id, filename)).
	// So model files land at: {cacheDir}/{org}/{model}/{filename}
	// We check for config.json as a sentinel that the download completed.
	const modelId = MODEL_IDS[modelSize]; // e.g. "onnx-community/whisper-tiny.en"
	const [org, model] = modelId.split("/") as [string, string];
	return existsSync(join(cacheDir, org, model, "config.json"));
}

export function clearModelCache(cacheDir: string): void {
	rmSync(cacheDir, { recursive: true, force: true });
	mkdirSync(cacheDir, { recursive: true });
}

export class WhisperTranscriber {
	private pipe: AutomaticSpeechRecognitionPipeline | null = null;

	isReady(): boolean {
		return this.pipe !== null;
	}

	async init(
		cacheDir: string,
		modelSize: "tiny" | "base",
		pluginDir: string,
		onProgress?: (phase: "downloading" | "loading") => void,
	): Promise<void> {
		const cached = modelExistsOnDisk(cacheDir, modelSize);
		const modelId = MODEL_IDS[modelSize];
		debug(`whisper.init: cacheDir=${cacheDir}, model=${modelId}, cached=${cached}`);
		debug(`env before: cacheDir=${env.cacheDir}, allowRemote=${env.allowRemoteModels}, allowLocal=${env.allowLocalModels}`);
		configureEnv(cacheDir, !cached, pluginDir);
		debug(`env after: cacheDir=${env.cacheDir}, allowRemote=${env.allowRemoteModels}, allowLocal=${env.allowLocalModels}`);
		onProgress?.(cached ? "loading" : "downloading");

		// Cast through unknown to avoid TS2590 — pipeline() has deeply complex overload unions.
		// device: "wasm" forces WASM-only execution providers so ORT never tries to
		// load the JSEP/WebGPU backend (.jsep.mjs), which would also fail in Electron.
		type PipelineFn = (task: string, model: string, options: object) => Promise<AutomaticSpeechRecognitionPipeline>;
		debug("calling pipeline()...");
		this.pipe = await (pipeline as unknown as PipelineFn)(
			"automatic-speech-recognition",
			modelId,
			{
				dtype: "q8",
				device: "wasm",
				progress_callback: (info: unknown) => {
					debug("pipeline progress:", JSON.stringify(info));
					const i = info as Record<string, unknown>;
					if (i.status === "download") onProgress?.("downloading");
					if (i.status === "ready") onProgress?.("loading");
				},
			},
		);
		debug("pipeline() returned successfully");
	}

	async transcribeBlob(blob: Blob): Promise<string> {
		if (!this.pipe) throw new Error("Whisper not initialized");

		const arrayBuffer = await blob.arrayBuffer();
		const audio = await this.decodeToFloat32(arrayBuffer);
		type InferFn = (audio: Float32Array, opts: object) => Promise<{ text: string } | Array<{ text: string }>>;
		const result = await (this.pipe as unknown as InferFn)(audio, { sampling_rate: 16000 });

		if (Array.isArray(result)) {
			return result.map((r) => r.text).join(" ").trim();
		}
		return result.text?.trim() ?? "";
	}

	private async decodeToFloat32(
		arrayBuffer: ArrayBuffer,
	): Promise<Float32Array> {
		const tempCtx = new AudioContext();
		let decoded: AudioBuffer;
		try {
			decoded = await tempCtx.decodeAudioData(arrayBuffer);
		} finally {
			await tempCtx.close();
		}

		const targetRate = 16000;
		if (
			decoded.sampleRate === targetRate &&
			decoded.numberOfChannels === 1
		) {
			return decoded.getChannelData(0).slice();
		}

		const numSamples = Math.ceil(decoded.duration * targetRate);
		const offlineCtx = new OfflineAudioContext(1, numSamples, targetRate);
		const source = offlineCtx.createBufferSource();
		source.buffer = decoded;
		source.connect(offlineCtx.destination);
		source.start();
		const rendered = await offlineCtx.startRendering();
		return rendered.getChannelData(0).slice();
	}

	dispose(): void {
		(this.pipe as { dispose?: () => void } | null)?.dispose?.();
		this.pipe = null;
	}
}
