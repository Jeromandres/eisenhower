import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice, MarkdownRenderer, Component } from "obsidian";

export class EisenhowerView extends ItemView {
  static viewType = "eisenhower-view";

  private deps: { logger?: any; todoIndex?: any; settings?: any };

  private mdComponent = new Component();
  
  constructor(
    leaf: WorkspaceLeaf,
    deps: { logger?: any; todoIndex?: any; settings?: any } = {}
  ) {
    super(leaf);
    this.deps = deps;
	this.addChild(this.mdComponent);
  }

  private async renderInlineMarkdown(target: HTMLElement, md: string, sourcePath: string) {
    target.empty();
    await MarkdownRenderer.renderMarkdown(md, target, sourcePath, this.mdComponent);
  }
	
	getViewType(): string {
    return EisenhowerView.viewType;
  }

  getDisplayText(): string {
    return "Eisenhower Matrix";
  }

	private getTasksApi() {
	  const plugins = (this.app as any).plugins;
	  return plugins?.getPlugin?.("obsidian-tasks-plugin")?.apiV1;
	}
	
	private async readLineFromFile(file: TFile, line: number): Promise<string | null> {
	  const content = await this.app.vault.read(file);
	  const lines = content.split("\n");
	  if (line < 0 || line >= lines.length) return null;
	  return lines[line];
	}
	
	private async replaceLineInFile(file: TFile, line: number, newLine: string): Promise<boolean> {
	  const content = await this.app.vault.read(file);
	  const lines = content.split("\n");
	  if (line < 0 || line >= lines.length) return false;
	  lines[line] = newLine;
	  await this.app.vault.modify(file, lines.join("\n"));
	  return true;
	}
	
	private getCheckboxState(line: string): "DONE" | "TODO" | "NONE" {
	  const m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+/);
	  if (!m) return "NONE";
	  return m[1].toLowerCase() === "x" ? "DONE" : "TODO";
	}
	
	private toggleCheckboxLine(line: string): string {
	  const m = line.match(/^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/);
	  if (!m) return line; // fallback: on ne force pas un format inconnu
	  const cur = m[2].toLowerCase() === "x" ? "x" : " ";
	  const next = cur === "x" ? " " : "x";
	  return `${m[1]}${next}${m[3]}${m[4]}`;
	}
	
	private sourceFileLabel(t: any): string {
	  const f = t?.file;
	  const path = f?.id ?? t?.path ?? t?.filePath ?? "";
	  if (typeof path !== "string" || !path) return "";
	  const name = path.split("/").pop() ?? path;
	  return name.replace(/\.md$/i, "");
	}
	
	private async openTodoOccurrence(t: any) {
	  await this.openTodo(t); // déjà OK chez toi
	}
	
	private async toggleTodoStatus(t: any) {
	  const file = this.getTodoFile(t);
	  const line = this.getTodoLine(t);
	  if (!file || line == null) return;
	
	  const original = await this.readLineFromFile(file, line);
	  if (!original) return;
	
	  const next = this.toggleCheckboxLine(original);
	  if (next === original) {
	    new Notice("Impossible de basculer: ligne non reconnue comme tâche markdown.");
	    return;
	  }
	
	  await this.replaceLineInFile(file, line, next);
	}
	
	private async editWithTasksModal(t: any) {
	  const tasksApi = this.getTasksApi();
	  if (!tasksApi?.editTaskLineModal) {
	    new Notice("Tasks API editTaskLineModal introuvable.");
	    return;
	  }
	
	  const file = this.getTodoFile(t);
	  const line = this.getTodoLine(t);
	  if (!file || line == null) return;
	
	  const original = await this.readLineFromFile(file, line);
	  if (!original) return;
	
	  let edited: string;
	  try {
	    edited = await tasksApi.editTaskLineModal(original);
	  } catch {
	    new Notice("Échec d’ouverture du modal Tasks.");
	    return;
	  }
	
	  if (!edited) return; // cancel
	  await this.replaceLineInFile(file, line, edited);
	}

	private normalizePeopleLinkLabels(text: string): string {
	  return text.replace(
	    /\[\[([^\]|]+)(\|[^\]]*)?\]\]/g,
	    (_m, target) => {
	      const label = target.replace(/_/g, " ");
	      return `[[${target}|${label}]]`;
	    }
	  );
	}

	private wireInternalLinks(root: HTMLElement, sourcePath: string) {
	  root.querySelectorAll("a.internal-link").forEach((a) => {
	    // évite de binder 2 fois
	    if ((a as any).dataset?.pwBound === "1") return;
	    (a as any).dataset.pwBound = "1";
	
	    const href =
	      a.getAttribute("data-href") ||
	      a.getAttribute("href") ||
	      "";
	
	    if (!href) return;
	
	    a.addEventListener("click", (ev) => {
	      ev.preventDefault();
	      ev.stopPropagation();
	      this.app.workspace.openLinkText(href, sourcePath || "", false);
	    });
	  });
	}
	
	async render() {
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
		
		  const renderList = async (boxEl: HTMLElement, items: any[]) => {
		  if (!items.length) {
		    boxEl.createEl("div", { text: "—", cls: "pw-eisenhower-empty" });
		    return;
		  }
		
		  const list = boxEl.createDiv({ cls: "pw-eisenhower-list" });
		  const hasTasksModal = !!this.getTasksApi()?.editTaskLineModal;
		
		  for (const t of items) {
		    const file = this.getTodoFile(t);
		    const lineNo = this.getTodoLine(t);
		    const sourcePath = file?.path ?? "";
		    const fileLabel = this.sourceFileLabel(t);
		
		    const textRaw = String(t?.text ?? "");
			const labelRaw = this.normalizePeopleLinkLabels(
			  this.stripEisenhowerTags(textRaw)
			) || "(sans texte)";		
			  
			const row = list.createDiv({ cls: "pw-eisenhower-row" });
	
			// --- conteneur unique (checkbox + texte + crayon) ---
			const main = row.createDiv({ cls: "pw-eisenhower-main" });
			
			// 1) checkbox (dans main)
			const cb = main.createEl("input", {
			  type: "checkbox",
			  cls: "task-list-item-checkbox",
			});
			cb.tabIndex = -1;
			
			// init checked
			if (file && lineNo != null) {
			  const ln = await this.readLineFromFile(file, lineNo);
			  if (ln) cb.checked = this.getCheckboxState(ln) === "DONE";
			}
			
			cb.onclick = async (ev) => {
			  ev.preventDefault();
			  ev.stopPropagation();
			  await this.toggleTodoStatus(t);
			
			  if (file && lineNo != null) {
			    const ln = await this.readLineFromFile(file, lineNo);
			    if (ln) cb.checked = this.getCheckboxState(ln) === "DONE";
			  }
			};
			
			// 2) texte markdown (dans main)
			const mdHost = main.createSpan({ cls: "pw-eisenhower-md" });
			
			// >>> ICI ton bloc md : tu le gardes ICI, entre mdHost et renderInline
			const md = sourcePath
			  ? `[[${sourcePath.replace(/\.md$/i, "")}|${fileLabel}]] — ${labelRaw}`
			  : labelRaw;
			
			await this.renderInlineMarkdown(mdHost, md, sourcePath || "");
			this.wireInternalLinks(mdHost, sourcePath || "");	
			  
			// ✅ AJOUTER
			const p = mdHost.querySelector("p") ?? mdHost;
			
			const editBtn = p.createEl("button", {
			  cls: "pw-eisenhower-edit-inline",
			  text: "✏️",
			});
			editBtn.type = "button";
			editBtn.title = hasTasksModal ? "Éditer (Tasks modal)" : "Tasks modal indisponible";
			editBtn.disabled = !hasTasksModal;
			editBtn.onclick = async (ev) => {
			  ev.preventDefault();
			  ev.stopPropagation();
			  await this.editWithTasksModal(t);
			};
			
			// clic ligne -> ouvrir occurrence
			row.onclick = async (ev) => {
			  const el = ev.target as HTMLElement;
			  if (el.closest("a, input, button")) return;
			  await this.openTodoOccurrence(t);
			};
		
		    // clic ligne -> ouvrir occurrence (sauf clic sur input/bouton/lien)
		    row.onclick = async (ev) => {
		      const el = ev.target as HTMLElement;
		      if (el.closest("a, input, button")) return;
		      await this.openTodoOccurrence(t);
		    };
		  }
		};
		// Clear the small “rule” text and replace with lists
		q1.empty(); q1.createEl("h3", { text: "Q1 — Urgent & Important" }); await renderList(q1, buckets.Q1);
		q2.empty(); q2.createEl("h3", { text: "Q2 — Important (not urgent)" }); await renderList(q2, buckets.Q2);
		q3.empty(); q3.createEl("h3", { text: "Q3 — Urgent (not important)" }); await renderList(q3, buckets.Q3);
		q4.empty(); q4.createEl("h3", { text: "Q4 — Someday/Maybe" }); await renderList(q4, buckets.Q4);
		inbox.empty(); inbox.createEl("h3", { text: "Inbox — non classé" }); await renderList(inbox, buckets.INBOX);
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
