# Release Checklist

## Code quality

- [x] TypeScript compiles clean (`npm run build`)
- [x] End-to-end tested: local transcription, cloud transcription, convert transcript, transcribe audio file
- [x] Debug logging — replaced all `console.log`/`console.warn`/`console.error` with `debug()`/`warn()` from `src/utils/log.ts`, gated by `__DEV__` compile-time flag (esbuild `define`). Production builds strip debug calls via dead-code elimination.
- [ ] Run `npm run lint` — 125 pre-existing errors (mostly `no-unsafe-any`, `sentence-case`, `no-nodejs-modules`). No new errors from our changes.

## Package metadata

- [x] `package.json` — updated name to `"phonolite"`, version to `"0.1.0"`, description to match manifest.
- [x] `versions.json` — updated to `"0.1.0": "1.0.0"` (plugin v0.1.0 requires Obsidian ≥1.0.0).
- [x] `manifest.json` — updated `minAppVersion` to `"1.0.0"` (Obsidian public release, Oct 2022).
- [x] `LICENSE` — updated copyright to `Matt Antalek 2025-2026`.

## Gitignore / repo hygiene

- [x] `.claude/` directory — already covered by `.claude*` pattern in `.gitignore`.
- [x] `AGENTS.md` — added to `.gitignore`, removed from git tracking (`git rm --cached`).
- [x] `.env.dev` — confirmed covered by `.gitignore` line 31.
- [x] `CLAUDE.md` — confirmed gitignored.
- [x] `TESTING.md` / `default-convert-prompt.md` — confirmed gitignored.

## Release artifacts

- [x] GitHub Actions release workflow — `.github/workflows/release.yml` triggers on tag push, builds, and attaches `main.js`, `manifest.json`, `styles.css` to a GitHub Release.
- [x] ORT WASM files — plugin auto-downloads from `phonolite.rocks/ort/` on first launch (desktop only). Also available in repo `ort/` dir for manual install. Dev builds still copy from `node_modules`.
- [x] `esbuild.config.mjs` — production builds output to `./dist`, dev builds output to local vault path.

## Submission

- [ ] Community plugin submission — PR to [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases) when ready
