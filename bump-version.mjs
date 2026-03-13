#!/usr/bin/env node
/**
 * bump-version.mjs
 * Usage: node bump-version.mjs <new-version>
 * Example: node bump-version.mjs 1.0.5
 *
 * Updates the version in:
 *   - package.json
 *   - manifest.json
 *   - versions.json  (adds a new entry mapping the version to the min Obsidian API version)
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = (f) => resolve(__dirname, f);

const newVersion = process.argv[2];

if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error("Usage: node bump-version.mjs <major.minor.patch>");
  process.exit(1);
}

// --- package.json ---
const pkg = JSON.parse(readFileSync(root("package.json"), "utf8"));
const oldVersion = pkg.version;
pkg.version = newVersion;
writeFileSync(root("package.json"), JSON.stringify(pkg, null, "\t") + "\n");
console.log(`package.json:  ${oldVersion} → ${newVersion}`);

// --- manifest.json ---
const manifest = JSON.parse(readFileSync(root("manifest.json"), "utf8"));
const minObsidianVersion = manifest.minAppVersion;
manifest.version = newVersion;
writeFileSync(root("manifest.json"), JSON.stringify(manifest, null, "\t") + "\n");
console.log(`manifest.json: ${oldVersion} → ${newVersion}`);

// --- versions.json ---
const versions = JSON.parse(readFileSync(root("versions.json"), "utf8"));
if (versions[newVersion]) {
  console.log(`versions.json: ${newVersion} already exists — skipping`);
} else {
  versions[newVersion] = minObsidianVersion;
  writeFileSync(root("versions.json"), JSON.stringify(versions, null, "\t") + "\n");
  console.log(`versions.json: added ${newVersion} → minAppVersion ${minObsidianVersion}`);
}

console.log(`\nDone. Next steps:`);
console.log(`  1. git add package.json manifest.json versions.json`);
console.log(`  2. git commit -m "bump version to ${newVersion}"`);
console.log(`  3. git tag ${newVersion} && git push && git push --tags`);
