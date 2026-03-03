import type { NotePayload } from "../api/client";

export function renderTemplate(
	template: string,
	payload: NotePayload,
	transcript: string,
): string {
	const date = new Date().toISOString().slice(0, 10);

	const sections = payload.sections
		.map((s) => `## ${s.heading}\n\n${s.content}`)
		.join("\n\n");

	const actionItems = payload.actionItems.length > 0
		? payload.actionItems.map((item) => `- [ ] ${item}`).join("\n")
		: "";

	const tags = `[${payload.tags.join(", ")}]`;

	return template
		.replace(/\{\{title\}\}/g, payload.title)
		.replace(/\{\{summary\}\}/g, payload.summary)
		.replace(/\{\{sections\}\}/g, sections ? sections + "\n\n" : "")
		.replace(/\{\{actionItems\}\}/g, actionItems)
		.replace(/\{\{tags\}\}/g, tags)
		.replace(/\{\{date\}\}/g, date)
		.replace(/\{\{transcript\}\}/g, transcript);
}
