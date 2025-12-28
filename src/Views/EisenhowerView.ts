import { ItemView, WorkspaceLeaf } from "obsidian";

export class EisenhowerView extends ItemView {
  static viewType = "eisenhower-view";

  private deps: { logger?: any; todoIndex?: any; settings?: any };

  constructor(
    leaf: WorkspaceLeaf,
    deps: { logger?: any; todoIndex?: any; settings?: any } = {}
  ) {
    super(leaf);
    this.deps = deps;
  }

  getViewType(): string {
    return EisenhowerView.viewType;
  }

  getDisplayText(): string {
    return "Eisenhower Matrix";
  }
	
	render() {
	  const { containerEl } = this;
	  containerEl.empty();
	
	  // Root
	  containerEl.addClass("pw-eisenhower-root");
	
	  containerEl.createEl("h2", { text: "Eisenhower Matrix" });
	
	  // Grid
	  const grid = containerEl.createDiv({ cls: "pw-eisenhower-grid" });
	
	  const q1 = grid.createDiv({ cls: "pw-eisenhower-card" });
	  q1.createEl("h3", { text: "Q1 — Urgent & Important" });
	  q1.createEl("div", { text: "Do" });
	
	  const q2 = grid.createDiv({ cls: "pw-eisenhower-card" });
	  q2.createEl("h3", { text: "Q2 — Important (not urgent)" });
	  q2.createEl("div", { text: "Plan" });
	
	  const q3 = grid.createDiv({ cls: "pw-eisenhower-card" });
	  q3.createEl("h3", { text: "Q3 — Urgent (not important)" });
	  q3.createEl("div", { text: "Delegate" });
	
	  const q4 = grid.createDiv({ cls: "pw-eisenhower-card" });
	  q4.createEl("h3", { text: "Q4 — Someday/Maybe" });
	  q4.createEl("div", { text: "Eliminate / Defer" });
	}

  async onOpen() {
    this.render();
  }

  async onClose() {
    this.containerEl.empty();
  }
}
