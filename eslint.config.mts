import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

// Extract the import plugin instance that obsidianmd already registers.
// We need the same instance reference to avoid "Cannot redefine plugin" from ESLint.
type AnyPlugin = Parameters<typeof tseslint.config>[number] extends { plugins?: infer P } ? NonNullable<P>[string] : never;
const obsidianRecommended = [...(obsidianmd.configs.recommended as unknown as Iterable<{ plugins?: Record<string, AnyPlugin> }>)];
const importPlugin = obsidianRecommended.find(c => c.plugins?.["import"])?.plugins?.["import"] as AnyPlugin;

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
				// esbuild outputs CJS format; require() is available at runtime in Electron renderer
				require: "readonly",
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Re-declare same plugin instances to override their rules.
		// Using the same object references avoids "Cannot redefine plugin" errors.
		plugins: { obsidianmd, import: importPlugin },
		rules: {
			// Allow "Phonolite" (brand) and common acronyms in UI strings — eliminates
			// the need for per-line eslint-disable comments on those strings.
			"obsidianmd/ui/sentence-case": ["warn", {
				brands: ["Phonolite"],
				acronyms: ["API", "LLM", "ORT", "WASM", "URL", "MB"],
			}],
			// fs and path are used only for local disk access (model cache, ORT WASM files,
			// pipeline records) where no Obsidian file API equivalent exists.
			"import/no-nodejs-modules": ["warn", { allow: ["fs", "path"] }],
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"ort/",
		"esbuild.config.mjs",
		"eslint.config.js",
		"inject-ort-env.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
