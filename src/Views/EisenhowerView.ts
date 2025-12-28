import { ItemView, WorkspaceLeaf, App } from "obsidian";
import { Logger } from "../infrastructure/logger";
import { TodoIndex } from "../domain/TodoIndex";
import { PluginSettings } from "../domain/PluginSettings";

export const EISENHOWER_VIEW_TYPE = "eisenhower-view";

interface EisenhowerDeps {
	logger: Logger;
	todoIndex: TodoIndex;
	settings: PluginSettings;
	app: App;
}

export class EisenhowerView extends ItemView {
	private logger: Logger;
	private todoIndex: TodoIndex;
	private settings: PluginSettings;
	private app: App;

	constructor(leaf: WorkspaceLeaf, deps: EisenhowerDeps) {
		super(leaf);
		this.logger = deps.logger;
		this.todoIndex = deps.todoIndex;
		this.settings = deps.settings;
		this.app = deps.app;
	}

	getViewType(): string {
		return EISENHOWER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Eisenhower Matrix";
	}

	render() {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Eisenhower Matrix" });
		containerEl.createEl("p", {
			text: "Ready. Next step: 2×2 grid based on #urgent / #important.",
		});

		this.logger.info("Eisenhower view rendered");
	}

	async onClose() {
		this.containerEl.empty();
	}
}
