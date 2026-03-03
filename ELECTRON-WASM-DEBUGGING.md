# Running ONNX Runtime + transformers.js in Obsidian's Electron Renderer

This document chronicles the debugging journey of getting local on-device Whisper speech-to-text working inside an Obsidian plugin. The plugin uses [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) (which depends on [`onnxruntime-web`](https://github.com/nicedayto/onnxruntime-web)) to run Whisper inference entirely on-device via WebAssembly.

What should have been a straightforward `pipeline("automatic-speech-recognition", model)` call required solving **six cascading bugs**, each revealed only after fixing the previous one. Every bug stems from the same root cause: **Obsidian's Electron renderer is neither a standard browser nor a standard Node.js environment** — it's a hybrid that breaks assumptions made by both ONNX Runtime and transformers.js.

These issues likely affect any Obsidian plugin (or Electron app) attempting to run ONNX/WASM inference. We hope documenting them helps the community and perhaps motivates upstream fixes.

---

## Environment

- Obsidian desktop (Electron renderer process)
- `@huggingface/transformers` 3.8.1
- `onnxruntime-web` 1.22.x (bundled by transformers.js)
- esbuild bundler, CJS output format
- Plugin runs in Electron's renderer with full Node.js API access

## The Six Bugs

### Bug 1: onnxruntime-node selected instead of onnxruntime-web

**Error:** `InferenceSession is undefined`

**Root cause:** transformers.js checks `process.release.name === 'node'` to decide between `onnxruntime-node` (native C++ addon) and `onnxruntime-web` (WASM). In Electron's renderer, `process.release.name` is `"node"` — so it picks the native addon, which can't be bundled by esbuild.

**Fix:** An esbuild banner IIFE that patches `process.release.name` to `"browser"` before any module evaluates:

```javascript
const banner = `(function(){
  if(typeof process!=="undefined" && process.release && process.release.name==="node"){
    try {
      Object.defineProperty(process,"release",{
        value: Object.assign({},process.release,{name:"browser"}),
        writable:true, configurable:true
      });
    } catch(_){}
  }
})();`;
```

**Why not `esbuild.define`?** The expression `process.release.name` uses optional chaining patterns internally that `define` can't match. A banner runs before all bundled code — guaranteed.

---

### Bug 2: Dynamic import of JSEP module blocked

**Error:** `Failed to fetch dynamically imported module: file:///...ort-wasm-simd-threaded.jsep.mjs`

**Root cause:** ONNX Runtime uses `import()` to load its WASM bootstrap module. Electron's renderer blocks `import()` of `file://` URLs for security. The module needs to be served from a URL scheme that Electron's ESM loader accepts.

**Fix:** Read the `.mjs` file from disk at plugin startup, create a `blob:` URL via `URL.createObjectURL`, and point ORT's `wasmPaths.mjs` to it:

```typescript
const mjsText = readFileSync(join(pluginDir, "ort-wasm-simd-threaded.jsep.mjs"), "utf-8");
const blobUrl = URL.createObjectURL(new Blob([mjsText], { type: "text/javascript" }));
onnx.wasm.wasmPaths = { mjs: blobUrl };
```

---

### Bug 3: wasmPaths keys are short names, not filenames

**Error:** ORT still tried to load from `app://obsidian.md/ort-wasm-simd-threaded.jsep.mjs`

**Root cause:** We initially set `wasmPaths["ort-wasm-simd-threaded.jsep.mjs"] = blobUrl`. But reading the minified ORT source (`ort.min.mjs`) revealed:

```javascript
let o = e.wasmPaths;
let s = o?.mjs;      // ← key is just "mjs", not the filename
let u = o?.wasm;     // ← key is just "wasm"
```

Also: ORT unconditionally loads the JSEP variant (`ort-wasm-simd-threaded.jsep.mjs`) regardless of whether WebGPU is available — the selection is hardcoded with `true ? "jsep" : "non-jsep"`.

**Fix:** Use short keys: `wasmPaths = { mjs: blobUrl, wasm: wasmBlobUrl }`.

---

### Bug 4: `import('worker_threads')` fails from blob: URL context

**Error:** `TypeError: Failed to resolve module specifier 'worker_threads'`

**Root cause:** Inside `ort-wasm-simd-threaded.jsep.mjs`, there's **top-level** code (outside the main function):

```javascript
// Line ~120 (TOP-LEVEL, runs during module evaluation)
var isNode = typeof globalThis.process?.versions?.node == 'string';
if (isNode) isPthread = (await import('worker_threads')).workerData === 'em-pthread';
```

This check does NOT include `process.type !== 'renderer'` (unlike a similar check inside the main function body on line 8 that correctly guards against Electron renderer). In Electron's renderer, `process.versions.node` is a string → `isNode = true` → `import('worker_threads')` fires. But since the module is loaded from a `blob:` URL (our fix for Bug 2), there's no Node.js module resolution available → the import fails.

**Fix:** Text-patch the `.mjs` source before creating the blob URL:

```typescript
mjsText = mjsText.replace(
  "var isNode = typeof globalThis.process?.versions?.node == 'string';",
  "var isNode = typeof globalThis.process?.versions?.node == 'string' && globalThis.process?.type !== 'renderer';",
);
```

**Note to ORT maintainers:** The top-level `isNode` check at line ~120 is missing the `process.type` guard that the inner check at line 8 correctly includes. Adding `&& "renderer" != process.type` to the top-level check would fix this for all Electron apps.

---

### Bug 5: `new URL()` throws with blob: + app:// origin

**Error:** `TypeError: Failed to construct 'URL': Invalid URL`

**Root cause:** When the JSEP module needs to locate its `.wasm` file, it does:

```javascript
// Line ~102 of ort-wasm-simd-threaded.jsep.mjs
wasmUrl ??= e.locateFile
  ? e.locateFile("ort-wasm-simd-threaded.jsep.wasm", "")
  : (new URL("ort-wasm-simd-threaded.jsep.wasm", import.meta.url)).href;
```

When `import.meta.url` is `blob:app://obsidian.md/uuid`, `new URL(relative, base)` throws because `app://` is Obsidian's custom protocol — not a valid base for URL resolution.

The key insight: `e.locateFile` is only set by ORT when `wasmPaths.wasm` is provided. If you use `wasmBinary` instead (pre-loaded buffer), ORT skips setting `locateFile` — and the JSEP module falls through to the broken `new URL()` path.

From `ort.min.mjs`:
```javascript
if (l) y.wasmBinary = l;           // wasmBinary path — locateFile NOT set
else if (d || i) y.locateFile = g => d ?? i + g;  // wasmPaths path — locateFile IS set
```

**Fix:** Use `wasmPaths.wasm = blobUrl` (NOT `wasmBinary = buffer`). This causes ORT to set `locateFile`, which the JSEP module calls directly — bypassing `new URL()` entirely.

---

### Bug 6: transformers.js FileCache broken (node:fs shimmed)

**Error:** `Error: File System Cache is not available in this environment.`

**Root cause:** transformers.js imports `fs` as `import fs from 'node:fs'` in its source. The library ships pre-built browser bundles where `node:fs` is shimmed to an empty module. Since esbuild resolves the browser bundle (no `platform: "node"` set), `IS_FS_AVAILABLE` is baked in as `false`.

Even after adding `node:*`-prefixed modules to esbuild's `external` list, this doesn't help — the transformers.js bundle was **already compiled** with the shim.

Meanwhile, the browser `Cache API` (which transformers.js tries first) works fine in Electron — but files are stored in browser cache, not on disk. This means our `modelExistsOnDisk()` check can never find them, and the settings UI always shows "Not downloaded."

**Fix:** Use `env.customCache` — transformers.js checks this before both browser cache and FileCache. We implement a `DiskCache` class that uses our own `fs` import (bare `"fs"`, properly externalized by esbuild):

```typescript
class DiskCache {
  constructor(private basePath: string) {}

  private urlToPath(key: string): string {
    const url = new URL(key);
    const parts = url.pathname.split("/").filter(Boolean);
    const resolveIdx = parts.indexOf("resolve");
    if (resolveIdx !== -1) {
      // Strip "resolve/{revision}" → org/model/file
      return join(this.basePath, ...parts.slice(0, resolveIdx), ...parts.slice(resolveIdx + 2));
    }
    return join(this.basePath, ...parts);
  }

  async match(request: string): Promise<Response | undefined> {
    const filePath = this.urlToPath(request);
    if (!existsSync(filePath)) return undefined;
    return new Response(readFileSync(filePath), {
      status: 200,
      headers: { "content-length": statSync(filePath).size.toString() },
    });
  }

  async put(request: string, response: Response): Promise<void> {
    const filePath = this.urlToPath(request);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
  }
}

// In configureEnv():
(env as any).useCustomCache = true;
(env as any).customCache = new DiskCache(cacheDir);
(env as any).useBrowserCache = false;
(env as any).useFSCache = false;
```

The URL-to-path mapping strips HuggingFace's `/resolve/main/` segment so files end up at `{cacheDir}/onnx-community/whisper-tiny.en/config.json` — matching our `modelExistsOnDisk()` check.

---

## Summary of All Fixes

| # | Error | Root Cause | Fix |
|---|-------|-----------|-----|
| 1 | InferenceSession undefined | `process.release.name === "node"` selects native ORT | esbuild banner patches to `"browser"` |
| 2 | Dynamic import blocked | Electron blocks `import()` of `file://` URLs | Serve .mjs as `blob:` URL |
| 3 | Wrong wasmPaths keys | ORT reads `wasmPaths.mjs` not `wasmPaths["filename.mjs"]` | Use short keys `{ mjs, wasm }` |
| 4 | worker_threads import fails | Top-level `isNode` check missing `process.type` guard | Text-patch .mjs before blob URL |
| 5 | Invalid URL construction | `new URL(rel, "blob:app://...")` throws on custom protocol | Use `wasmPaths.wasm` (not `wasmBinary`) to set `locateFile` |
| 6 | FileCache unavailable | `node:fs` shimmed in browser bundle | Custom `DiskCache` via `env.customCache` |

## What Would Help from Obsidian/Electron Side

1. **COOP/COEP headers** — Would enable `SharedArrayBuffer`, unlocking multi-threaded WASM for dramatically faster inference. Currently WASM runs single-threaded.

2. **Standard `file://` or `https://` origin** — The custom `app://obsidian.md` protocol breaks `new URL()` relative resolution from `blob:` contexts. Standard protocols would eliminate Bug 5.

3. **`import()` support for local files** — If Electron's renderer allowed dynamic `import()` of files within the plugin directory (even sandboxed), Bugs 2 and 4 would disappear.

## What Would Help from ORT/transformers.js Side

1. **ORT: Add `process.type` guard to top-level `isNode` check** in `ort-wasm-simd-threaded.jsep.mjs` — the inner function already has it, the top-level code doesn't (Bug 4).

2. **ORT: Document `wasmPaths` key format** — The short keys (`mjs`, `wasm`) are not documented anywhere. The minified source is the only reference.

3. **transformers.js: Export `FileCache` or document `customCache` better** — The `env.customCache` API exists but isn't well-documented for Electron use cases where `node:fs` is available but the browser bundle is resolved.

---

*This document was written during development of [Phonolite](https://github.com/themantalope/phonolite-obsidian), an Obsidian plugin for local voice-to-note transcription.*
