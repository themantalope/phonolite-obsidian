#!/usr/bin/env node
/**
 * release.mjs
 * Usage: node release.mjs <new-version> [commit-message]
 * Example: node release.mjs 1.2.0
 *          node release.mjs 1.2.0 "fix iOS polling"
 *
 * Does everything in one shot:
 *   1. Bumps package.json, manifest.json, versions.json
 *   2. Runs `npm run build` (type-check + esbuild)
 *   3. git add + commit
 *   4. git push
 *   5. git tag <version> + git push --tags
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = (f) => resolve(__dirname, f);

const run = (cmd) => execSync(cmd, { cwd: __dirname, stdio: "inherit" });

// ── Args ─────────────────────────────────────────────────────────────────────

const newVersion = process.argv[2];
const customMsg  = process.argv[3];

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error("Usage: node release.mjs <major.minor.patch> [commit-message]");
  process.exit(1);
}

// ── 1. Bump versions ─────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(root("package.json"), "utf8"));
const oldVersion = pkg.version;

if (oldVersion === newVersion) {
  console.error(`Already at ${newVersion}. Nothing to do.`);
  process.exit(1);
}

pkg.version = newVersion;
writeFileSync(root("package.json"), JSON.stringify(pkg, null, "\t") + "\n");
console.log(`package.json:  ${oldVersion} → ${newVersion}`);

const manifest = JSON.parse(readFileSync(root("manifest.json"), "utf8"));
const minObsidianVersion = manifest.minAppVersion;
manifest.version = newVersion;
writeFileSync(root("manifest.json"), JSON.stringify(manifest, null, "\t") + "\n");
console.log(`manifest.json: ${oldVersion} → ${newVersion}`);

const versions = JSON.parse(readFileSync(root("versions.json"), "utf8"));
if (!versions[newVersion]) {
  versions[newVersion] = minObsidianVersion;
  writeFileSync(root("versions.json"), JSON.stringify(versions, null, "\t") + "\n");
  console.log(`versions.json: added ${newVersion} → minAppVersion ${minObsidianVersion}`);
}

// ── 2. Build ─────────────────────────────────────────────────────────────────

console.log("\nBuilding...");
run("npm run build");

// ── 3. Commit ─────────────────────────────────────────────────────────────────

const commitMsg = customMsg
  ? `v${newVersion}: ${customMsg}`
  : `bump to ${newVersion}`;

run("git add package.json manifest.json versions.json");
run(`git commit -m "${commitMsg}"`);
console.log(`\nCommitted: ${commitMsg}`);

// ── 4. Push commit ────────────────────────────────────────────────────────────

run("git push");

// ── 5. Tag + push tag ─────────────────────────────────────────────────────────

run(`git tag ${newVersion}`);
run(`git push origin ${newVersion}`);

console.log(`\n✓ Released ${newVersion}`);
