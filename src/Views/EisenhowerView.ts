import { ItemView, WorkspaceLeaf } from "obsidian";
import { MarkdownView, TFile } from "obsidian";

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

	// Collect tasks from index (best-effort, without assuming exact API)
	const allTasks: any[] = this.deps?.todoIndex?.todos ?? [];
	
	const buckets: Record<string, any[]> = { Q1: [], Q2: [], Q3: [], Q4: [], INBOX: [] };
	
	for (const t of allTasks) {
	  const text = String(t?.text ?? t?.line ?? "");
	  if (!text) continue;
	  const b = this.bucketForTask(text);
	  buckets[b].push(t);
	}
	
	const renderList = (boxEl: HTMLElement, items: any[]) => {
	  if (!items.length) {
		boxEl.createEl("div", { text: "—", cls: "pw-eisenhower-empty" });
		return;
	  }
	
	  const list = boxEl.createDiv({ cls: "pw-eisenhower-list" });
	
	  for (const t of items) {
		const textRaw = String(t?.text ?? t?.line ?? "");
		const label = this.stripEisenhowerTags(textRaw) || "(sans texte)";
	
		const row = list.createDiv({ cls: "pw-eisenhower-row" });
	
		row.createDiv({ cls: "pw-eisenhower-dot" });
	
		const main = row.createDiv({ cls: "pw-eisenhower-main" });
	
		const a = main.createEl("a", {
		  text: label,
		  cls: "pw-eisenhower-title",
		  href: "#",
		});
	
		a.onclick = async (ev) => {
		  ev.preventDefault();
		  ev.stopPropagation();
		  await this.openTodo(t);
		};
	  }
	};
	
	// Clear the small “rule” text and replace with lists
	q1.empty(); q1.createEl("h3", { text: "Q1 — Urgent & Important" }); renderList(q1, buckets.Q1);
	q2.empty(); q2.createEl("h3", { text: "Q2 — Important (not urgent)" }); renderList(q2, buckets.Q2);
	q3.empty(); q3.createEl("h3", { text: "Q3 — Urgent (not important)" }); renderList(q3, buckets.Q3);
	q4.empty(); q4.createEl("h3", { text: "Q4 — Someday/Maybe" }); renderList(q4, buckets.Q4);
	inbox.empty(); inbox.createEl("h3", { text: "Inbox — non classé" }); renderList(inbox, buckets.INBOX);
	}
	
	private getTodoFile(t: any): TFile | null {
	  // cas direct
	  if (t?.file instanceof TFile) return t.file;
	
	  // cas "IFile<TFile>" (ObsidianFile) : souvent t.file.raw / t.file.file / t.file.tfile
	  const f = t?.file;
	  if (f?.raw instanceof TFile) return f.raw;
	  if (f?.file instanceof TFile) return f.file;
	  if (f?.tfile instanceof TFile) return f.tfile;
	
	  // cas "id" = path
	  const path = f?.id ?? t?.path ?? t?.filePath;
	  if (typeof path === "string") {
	    const af = this.app.vault.getAbstractFileByPath(path);
	    if (af instanceof TFile) return af;
	  }
	
	  return null;
	}
	
	private getTodoLine(t: any): number | null {
	  const ln = t?.line ?? t?.lineNumber ?? t?.lineNo;
	  return Number.isFinite(ln) ? Number(ln) : null;
	}
	
	private async openTodo(t: any) {
	  const file = this.getTodoFile(t);
	  const line = this.getTodoLine(t);
	
	  if (!file) return;
	
	  const leaf = this.app.workspace.getLeaf(false);
	  await leaf.openFile(file);
	
	  if (line == null) return;
	
	  const view = leaf.view instanceof MarkdownView ? leaf.view : this.app.workspace.getActiveViewOfType(MarkdownView);
	  if (!view) return;
	
	  const lineContent = view.editor.getLine(line) ?? "";
	  view.editor.setSelection({ ch: 0, line }, { ch: lineContent.length, line });
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
