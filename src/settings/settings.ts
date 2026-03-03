export interface PhonoLiteSettings {
	apiKey: string;
	serverUrl: string;
	forceCloud: boolean;
	modelSize: "tiny" | "base";
	modelPath: string;
	customPrompt: string;
	outputFolder: string;
	noteTemplate: string;
	recordingsFolder: string;
	transcriptsFolder: string;
}

export const DEFAULT_NOTE_TEMPLATE = `---
tags: {{tags}}
date: {{date}}
source: phonolite
---

# {{title}}

> {{summary}}

{{sections}}
## Action Items

{{actionItems}}`;

export const DEFAULT_SETTINGS: PhonoLiteSettings = {
	apiKey: "",
	serverUrl: "https://phonolite.rocks",
	forceCloud: false,
	modelSize: "tiny",
	modelPath: "",
	customPrompt: "",
	outputFolder: "",
	noteTemplate: DEFAULT_NOTE_TEMPLATE,
	recordingsFolder: "phonolite/recordings",
	transcriptsFolder: "phonolite/transcripts",
};
