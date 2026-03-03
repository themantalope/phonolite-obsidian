import { setIcon } from "obsidian";

export type StatusState =
	| "downloading"
	| "ready-local"
	| "ready-cloud"
	| "recording"
	| "transcribing-local"
	| "transcribing-cloud"
	| "error";

interface StateConfig {
	icon: string;
	text: string;
}

const STATE_CONFIG: Record<StatusState, StateConfig> = {
	"downloading":        { icon: "download",    text: "Downloading model..." },
	"ready-local":        { icon: "monitor",      text: "Phonolite" },
	"ready-cloud":        { icon: "cloud",        text: "Phonolite" },
	"recording":          { icon: "circle",       text: "Recording..." },
	"transcribing-local": { icon: "monitor",      text: "Transcribing..." },
	"transcribing-cloud": { icon: "cloud",        text: "Transcribing..." },
	"error":              { icon: "alert-circle", text: "Phonolite error" },
};

export class StatusBarManager {
	private el: HTMLElement;
	private iconEl: HTMLElement;
	private textEl: HTMLElement;
	private currentState: StatusState = "ready-cloud";

	constructor(
		statusBarItem: HTMLElement,
		openSettings: () => void,
	) {
		this.el = statusBarItem;
		this.el.addClass("phonolite-status-bar");

		this.iconEl = this.el.createSpan({ cls: "phonolite-status-icon" });
		this.textEl = this.el.createSpan({ cls: "phonolite-status-text" });

		this.el.onClickEvent(() => openSettings());
		this.setState("ready-cloud");
	}

	setState(state: StatusState): void {
		this.currentState = state;
		const config = STATE_CONFIG[state];
		setIcon(this.iconEl, config.icon);
		this.textEl.setText(config.text);
	}

	getState(): StatusState {
		return this.currentState;
	}
}
