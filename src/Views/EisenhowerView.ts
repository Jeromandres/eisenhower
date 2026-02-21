import {
  ItemView,
  WorkspaceLeaf,
  MarkdownView,
  TFile,
  Notice,
  MarkdownRenderer,
  Component,
  Platform,
} from "obsidian";
import { getTodoId } from "../domain/TodoItem";
import { Consts } from "../domain/Consts";

export class EisenhowerView extends ItemView {
  private debugEis = true;
  private activeMobileTab: "Q1" | "Q2" | "Q3" | "Q4" | "INBOX" = "Q1";

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

  private async renderInlineMarkdown(
    target: HTMLElement,
    md: string,
    sourcePath: string
  ) {
    target.empty();
    await MarkdownRenderer.renderMarkdown(md, target, sourcePath, this.mdComponent);
  }

  getViewType(): string {
    return EisenhowerView.viewType;
  }

  getDisplayText(): string {
    return "Eisenhower Matrix";
  }

  private stripEisenhowerTagsFromLine(line: string): string {
    return line
      .replace(/(^|\s)#urgent(\b)/gi, "$1")
      .replace(/(^|\s)#important(\b)/gi, "$1")
      .replace(/(^|\s)#someday(\b)/gi, "$1")
      .replace(/\s+/g, " ")
      .trimEnd();
  }

  private tagsForBucket(bucket: "Q1" | "Q2" | "Q3" | "Q4" | "INBOX"): string[] {
    switch (bucket) {
      case "Q1":
        return ["#urgent", "#important"];
      case "Q2":
        return ["#important"];
      case "Q3":
        return ["#urgent"];
      case "Q4":
        return ["#someday"];
      case "INBOX":
        return [];
    }
  }

  private applyBucketToLine(
    line: string,
    bucket: "Q1" | "Q2" | "Q3" | "Q4" | "INBOX"
  ): string {
    const base = this.stripEisenhowerTagsFromLine(line);
    const tags = this.tagsForBucket(bucket);
    if (!tags.length) return base;
    return `${base} ${tags.join(" ")}`.trimEnd();
  }

  private async moveTodoToBucket(
    t: any,
    bucket: "Q1" | "Q2" | "Q3" | "Q4" | "INBOX"
  ) {
    const file = this.getTodoFile(t);
    const lineNo = this.getTodoLine(t);
    if (!file || lineNo == null) return;

    const original = await this.readLineFromFile(file, lineNo);
    if (!original) return;

    const updated = this.applyBucketToLine(original, bucket);
    if (updated === original) return;

    console.log("[EIS] moveTodoToBucket BEFORE write", {
      bucket,
      file: file.path,
      lineNo,
      original,
      updated,
    });

    await this.replaceLineInFile(file, lineNo, updated);

    console.log("[EIS] moveTodoToBucket AFTER write", {
      bucket,
      file: file.path,
      lineNo,
      updatedLine: updated,
    });

    await this.maybeSyncOutlookAfterMove(updated, bucket);

    await this.render();
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

  private async replaceLineInFile(
    file: TFile,
    line: number,
    newLine: string
  ): Promise<boolean> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    if (line < 0 || line >= lines.length) return false;
    lines[line] = newLine;
    await this.app.vault.modify(file, lines.join("\n"));
    return true;
  }

  private getCheckboxState(line: string): "DONE" | "TODO" | "NONE" {
    // accepte - [ ] , - [x] , - [>] , - [/] , - [!] , - [?] ...
    const m = line.match(/^\s*[-*+]\s+\[([^\]])\]\s+/);
    if (!m) return "NONE";
    return m[1].toLowerCase() === "x" ? "DONE" : "TODO";
  }

  private toggleCheckboxLine(line: string): string {
    // bascule binaire : tout ce qui n'est pas x -> x ; x -> espace
    const m = line.match(/^(\s*[-*+]\s+\[)([^\]])(\]\s+)(.*)$/);
    if (!m) return line;

    const cur = m[2].toLowerCase();
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

    if (this.debugEis) {
      console.log("[EIS] toggleTodoStatus", {
        file: file?.path,
        line,
        text: t?.text,
      });
    }

    if (!file || line == null) {
      new Notice("EIS: file/line manquant");
      return;
    }

    const original = await this.readLineFromFile(file, line);
    if (this.debugEis) console.log("[EIS] original line", original);

    if (!original) {
      new Notice("EIS: ligne introuvable dans le fichier");
      return;
    }

    const state = this.getCheckboxState(original);
    if (this.debugEis) console.log("[EIS] checkbox state", state);

    const next = this.toggleCheckboxLine(original);
    if (next === original) {
      new Notice("Impossible de basculer: ligne non reconnue comme tâche markdown.");
      return;
    }
await this.replaceLineInFile(file, line, next);

// relire la ligne après écriture (sécurise le sync)
const after = await this.readLineFromFile(file, line);
if (this.debugEis) console.log("[EIS] after toggle", { after });

const isNowDone = after ? this.getCheckboxState(after) === "DONE" : false;

// Cas simple: si c'est une tâche Outlook et qu'elle vient d'être cochée -> sync Outlook
if (isNowDone && after && this.hasOutlookTag(after)) {
  const outlookId = this.extractOutlookIdFromLine(after);

  if (this.debugEis) console.log("[EIS] DONE sync check", {
    outlookId,
    hasOutlook: true,
    file: file.path,
    line,
  });

  if (outlookId) {
    await this.clearOutlookCategoriesById(outlookId);
  } else {
    // pas exploitable (ex: hook://application/com.microsoft.Outlook)
    if (this.debugEis) console.log("[EIS] skipped Outlook sync (no id)", { after });
  }
}

await this.render(); // refresh
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
    await this.render(); // refresh
  }

  private normalizePeopleLinkLabels(text: string): string {
    return text.replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, (_m, target) => {
      const label = target.replace(/_/g, " ");
      return `[[${target}|${label}]]`;
    });
  }

  private wireInternalLinks(root: HTMLElement, sourcePath: string) {
    root.querySelectorAll("a.internal-link").forEach((a) => {
      if ((a as any).dataset?.pwBound === "1") return;
      (a as any).dataset.pwBound = "1";

      const href = a.getAttribute("data-href") || a.getAttribute("href") || "";
      if (!href) return;

      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.app.workspace.openLinkText(href, sourcePath || "", false);
      });
    });
  }

  private refreshScheduled = false;

  private async refresh(reason = "manual") {
    if (this.refreshScheduled) return;
    this.refreshScheduled = true;

    window.setTimeout(async () => {
      this.refreshScheduled = false;
      try {
        this.mdComponent?.unload();
        this.mdComponent = new Component();
        this.addChild(this.mdComponent);

        await this.render();
      } catch (e) {
        console.error("[EIS] refresh failed:", e);
        new Notice("Eisenhower: refresh failed (voir console).");
      }
    }, 50);
  }

  /* ===================== OUTLOOK SYNC ===================== */

  private extractOutlookIdFromLine(line: string): string | null {
    // hook://outlook/99550
    const m = line.match(/hook:\/\/outlook\/(\d+)/i);
    return m ? m[1] : null;
  }

  private hasOutlookTag(line: string): boolean {
    return /(^|\s)#outlook(\b)/i.test(line);
  }

  private async setOutlookCategoriesById(
    outlookId: string,
    bucket: "Q1" | "Q2" | "Q3" | "Q4" | "INBOX"
  ): Promise<void> {
    const scriptPath = "/Users/support/Library/Services/set_outlook_bucket_by_id.scpt";

    try {
      const req = (window as any).require ?? require;
      const { execFile } = req("child_process");

      console.log("[EIS] Calling AppleScript", { scriptPath, outlookId, bucket });

      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
        (resolve, reject) => {
          execFile(
            "/usr/bin/osascript",
            [scriptPath, outlookId, bucket],
            (err: any, stdout: string, stderr: string) => {
              if (err) reject({ err, stdout, stderr });
              else resolve({ stdout, stderr });
            }
          );
        }
      );

      if (stdout?.trim()) console.log("[EIS] AppleScript stdout:", stdout.trim());
      if (stderr?.trim()) console.warn("[EIS] AppleScript stderr:", stderr.trim());
    } catch (e: any) {
      console.error("[EIS] Outlook sync failed:", e);
      new Notice("EIS: sync Outlook impossible (voir console).");
    }
  }

  private async maybeSyncOutlookAfterMove(
    updatedLine: string,
    bucket: "Q1" | "Q2" | "Q3" | "Q4" | "INBOX"
  ): Promise<void> {
    const hasOutlook = this.hasOutlookTag(updatedLine);
    const id = this.extractOutlookIdFromLine(updatedLine);

    console.log("[EIS] Outlook sync check", { hasOutlook, id, bucket });

    if (!hasOutlook) return;
    if (!id) return;

    await this.setOutlookCategoriesById(id, bucket);
  }

  private async clearOutlookCategoriesById(outlookId: string): Promise<void> {
  const scriptPath = "/Users/support/Library/Services/outlook_clear_triage_by_id.scpt";

  try {
    const req = (window as any).require ?? require;
    const { execFile } = req("child_process");

    await new Promise<void>((resolve, reject) => {
      execFile(
        "/usr/bin/osascript",
        [scriptPath, outlookId],
        (err: any, stdout: any, stderr: any) => {
          if (this.debugEis) {
            console.log("[EIS] Outlook AppleScript result", {
              outlookId,
              scriptPath,
              stdout: String(stdout || ""),
              stderr: String(stderr || ""),
              err: err ? String(err) : null,
            });
          }
          if (err) reject(err);
          else resolve();
        }
      );
    });
  } catch (e) {
    console.error("[EIS] Outlook clear failed:", e);
    new Notice("EIS: sync Outlook impossible (voir console).");
  }
}
  /* ===================== RENDER ===================== */

  async render() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.addClass("pw-eisenhower-root");
    if (Platform.isMobile) containerEl.addClass("pw-eisenhower-mobile");

    const header = containerEl.createDiv({ cls: "pw-eisenhower-header" });
    header.createEl("h2", { text: "Eisenhower Matrix" });

    const actions = header.createDiv({ cls: "pw-eisenhower-actions" });
    const refreshBtn = actions.createEl("button", {
      cls: "pw-eisenhower-refresh",
      text: "↻",
    });
    refreshBtn.type = "button";
    refreshBtn.title = "Rafraîchir la matrice";
    refreshBtn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      void this.refresh("button");
    };

    // Mobile tab bar (hidden on desktop via CSS)
    const tabs = containerEl.createDiv({ cls: "pw-eisenhower-tabs" });

    const grid = containerEl.createDiv({ cls: "pw-eisenhower-grid" });

    const q1 = grid.createDiv({ cls: "pw-eisenhower-card" });
    q1.createEl("h3", { text: "Q1 — Urgent & Important" });

    const q2 = grid.createDiv({ cls: "pw-eisenhower-card" });
    q2.createEl("h3", { text: "Q2 — Important (not urgent)" });

    const q3 = grid.createDiv({ cls: "pw-eisenhower-card" });
    q3.createEl("h3", { text: "Q3 — Urgent (not important)" });

    const q4 = grid.createDiv({ cls: "pw-eisenhower-card" });
    q4.createEl("h3", { text: "Q4 — Someday/Maybe" });

    const inbox = grid.createDiv({ cls: "pw-eisenhower-card pw-eisenhower-inbox" });
    inbox.createEl("h3", { text: "Inbox — non classé" });

    // Track cards for mobile tab switching
    const cardEls: Record<"Q1" | "Q2" | "Q3" | "Q4" | "INBOX", HTMLElement> = {
      Q1: q1, Q2: q2, Q3: q3, Q4: q4, INBOX: inbox,
    };

    // Set initial active card
    for (const [k, el] of Object.entries(cardEls)) {
      if (k === this.activeMobileTab) el.addClass("pw-eisenhower-card--mobile-active");
    }

    // Create tab buttons
    const tabDefs: Array<{ key: "Q1" | "Q2" | "Q3" | "Q4" | "INBOX"; label: string }> = [
      { key: "Q1", label: "Q1 — Urgent & Important" },
      { key: "Q2", label: "Q2 — Important" },
      { key: "Q3", label: "Q3 — Urgent" },
      { key: "Q4", label: "Q4 — Someday" },
      { key: "INBOX", label: "Inbox" },
    ];

    const tabBtns: HTMLElement[] = [];
    for (const { key, label } of tabDefs) {
      const btn = tabs.createEl("button", { cls: "pw-eisenhower-tab-btn", text: label });
      if (key === this.activeMobileTab) btn.addClass("pw-eisenhower-tab-btn--active");
      btn.type = "button";
      tabBtns.push(btn);
      btn.onclick = () => {
        this.activeMobileTab = key;
        tabBtns.forEach((b) => b.removeClass("pw-eisenhower-tab-btn--active"));
        btn.addClass("pw-eisenhower-tab-btn--active");
        for (const [k, el] of Object.entries(cardEls)) {
          if (k === key) el.addClass("pw-eisenhower-card--mobile-active");
          else el.removeClass("pw-eisenhower-card--mobile-active");
        }
      };
    }

    const makeDropZone = (
      boxEl: HTMLElement,
      bucket: "Q1" | "Q2" | "Q3" | "Q4" | "INBOX",
      idToTodo: Map<string, any>
    ) => {
      boxEl.addClass("pw-eisenhower-dropzone");

      boxEl.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        boxEl.addClass("pw-eisenhower-dropzone--over");
      });

      boxEl.addEventListener("dragleave", () => {
        boxEl.removeClass("pw-eisenhower-dropzone--over");
      });

      boxEl.addEventListener("drop", async (ev: DragEvent) => {
        ev.preventDefault();
        boxEl.removeClass("pw-eisenhower-dropzone--over");

        const id =
          ev.dataTransfer?.getData(Consts.TodoItemDragType) ||
          ev.dataTransfer?.getData("text/plain");
        if (!id) return;

        const todo = idToTodo.get(id);
        if (!todo) return;

        await this.moveTodoToBucket(todo, bucket);
      });
    };

    const allTasks: any[] = (this.deps?.todoIndex?.todos ?? []).filter(
      (t: any) => t?.status !== 4
    );

    const idToTodo = new Map<string, any>();
    for (const t of allTasks) idToTodo.set(getTodoId(t), t);

    const buckets: Record<"Q1" | "Q2" | "Q3" | "Q4" | "INBOX", any[]> = {
      Q1: [],
      Q2: [],
      Q3: [],
      Q4: [],
      INBOX: [],
    };

    for (const t of allTasks) {
      const file = this.getTodoFile(t);
      const lineNo = this.getTodoLine(t);

      const rawLine =
        file && lineNo != null ? await this.readLineFromFile(file, lineNo) : null;

      const textForTags = (rawLine ?? String(t?.text ?? "")).trim();
      if (!textForTags) continue;

      const b = this.bucketForTask(textForTags);
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
        const labelRaw =
          this.normalizePeopleLinkLabels(this.stripEisenhowerTags(textRaw)) ||
          "(sans texte)";

        const row = list.createDiv({ cls: "pw-eisenhower-row" });
        row.draggable = true;

        const id = getTodoId(t);
        row.addEventListener("dragstart", (ev: DragEvent) => {
          ev.dataTransfer?.setData(Consts.TodoItemDragType, id);
          ev.dataTransfer?.setData("text/plain", id);
          ev.dataTransfer!.effectAllowed = "move";
        });

        // --- conteneur unique (checkbox + texte + crayon) ---
        const main = row.createDiv({ cls: "pw-eisenhower-main" });

        // 1) checkbox
        const cb = main.createEl("input", {
          type: "checkbox",
          cls: "task-list-item-checkbox",
        });
        cb.tabIndex = -1;

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

        // 2) texte markdown
        const mdHost = main.createSpan({ cls: "pw-eisenhower-md" });

        const md = sourcePath
          ? `[[${sourcePath.replace(/\.md$/i, "")}|${fileLabel}]] — ${labelRaw}`
          : labelRaw;

        await this.renderInlineMarkdown(mdHost, md, sourcePath || "");
        this.wireInternalLinks(mdHost, sourcePath || "");

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

        row.onclick = async (ev) => {
          const el = ev.target as HTMLElement;
          if (el.closest("a, input, button")) return;
          await this.openTodoOccurrence(t);
        };
      }
    };

    // Rebuild each card as a dropzone + list
    q1.empty();
    q1.createEl("h3", { text: "Q1 — Urgent & Important" });
    makeDropZone(q1, "Q1", idToTodo);
    await renderList(q1, buckets.Q1);

    q2.empty();
    q2.createEl("h3", { text: "Q2 — Important (not urgent)" });
    makeDropZone(q2, "Q2", idToTodo);
    await renderList(q2, buckets.Q2);

    q3.empty();
    q3.createEl("h3", { text: "Q3 — Urgent (not important)" });
    makeDropZone(q3, "Q3", idToTodo);
    await renderList(q3, buckets.Q3);

    q4.empty();
    q4.createEl("h3", { text: "Q4 — Someday/Maybe" });
    makeDropZone(q4, "Q4", idToTodo);
    await renderList(q4, buckets.Q4);

    inbox.empty();
    inbox.createEl("h3", { text: "Inbox — non classé" });
    makeDropZone(inbox, "INBOX", idToTodo);
    await renderList(inbox, buckets.INBOX);
  }

  private getTodoFile(t: any): TFile | null {
    if (t?.file instanceof TFile) return t.file;

    const f = t?.file;
    if (f?.raw instanceof TFile) return f.raw;
    if (f?.file instanceof TFile) return f.file;
    if (f?.tfile instanceof TFile) return f.tfile;

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

    const view =
      leaf.view instanceof MarkdownView
        ? leaf.view
        : this.app.workspace.getActiveViewOfType(MarkdownView);
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
