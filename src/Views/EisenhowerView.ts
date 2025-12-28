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

  containerEl.addClass("pw-eisenhower-root");
  containerEl.createEl("h2", { text: "Eisenhower Matrix" });

  const grid = containerEl.createDiv({ cls: "pw-eisenhower-grid" });

  const q1 = grid.createDiv({ cls: "pw-eisenhower-card" });
  q1.createEl("h3", { text: "Q1 — Urgent & Important" });
  q1.createEl("div", { text: "#urgent + #important" });

  const q2 = grid.createDiv({ cls: "pw-eisenhower-card" });
  q2.createEl("h3", { text: "Q2 — Important (not urgent)" });
  q2.createEl("div", { text: "#important (sans #urgent)" });

  const q3 = grid.createDiv({ cls: "pw-eisenhower-card" });
  q3.createEl("h3", { text: "Q3 — Urgent (not important)" });
  q3.createEl("div", { text: "#urgent (sans #important)" });

  const q4 = grid.createDiv({ cls: "pw-eisenhower-card" });
  q4.createEl("h3", { text: "Q4 — Someday/Maybe" });
  q4.createEl("div", { text: "#someday (sans #urgent ni #important)" });

  const inbox = grid.createDiv({ cls: "pw-eisenhower-card pw-eisenhower-inbox" });
  inbox.createEl("h3", { text: "Inbox — non classé" });
  inbox.createEl("div", { text: "Aucun tag: #urgent / #important / #someday" });
}

	private hasTag(text: string, tag: string): boolean {
	  const re = new RegExp(`(^|\\s)#${tag}(\\b|\\s)`, "i");
	  return re.test(text ?? "");
	}
	
	private bucketForTask(text: string): "Q1" | "Q2" | "Q3" | "Q4" | "INBOX" {
	  const urgent = this.hasTag(text, "urgent");
	  const important = this.hasTag(text, "important");
	  const someday = this.hasTag(text, "someday");
	
	  if (urgent && important) return "Q1";
	  if (important && !urgent) return "Q2";
	  if (urgent && !important) return "Q3";
	  if (someday && !urgent && !important) return "Q4";
	  return "INBOX";
	}
	
	private stripEisenhowerTags(text: string): string {
	  return (text ?? "")
	    .replace(/(^|\s)#urgent(\b)/gi, "$1")
	    .replace(/(^|\s)#important(\b)/gi, "$1")
	    .replace(/(^|\s)#someday(\b)/gi, "$1")
	    .replace(/\s+/g, " ")
	    .trim();
	}
  async onOpen() {
    this.render();
  }

  async onClose() {
    this.containerEl.empty();
  }
	
}
