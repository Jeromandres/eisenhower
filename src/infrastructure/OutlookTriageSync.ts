import { App, Notice, TFile } from "obsidian";
import { setTimeout as nodeSetTimeout, clearTimeout as nodeClearTimeout } from "timers";

type Timer = ReturnType<typeof nodeSetTimeout>;

type TaskState = {
  done: boolean;
  hasOutlook: boolean;
};

export class OutlookTriageSync {
  private app: App;

  // cache par fichier : map outlookId -> état
  private lastStateByPath = new Map<string, Map<string, TaskState>>();

  // debounce par fichier
  private timers = new Map<string, Timer>();

  // réglages
  private debounceMs = 800;

  // filtre perf (ajuste si tu veux plus large)
  private onlyPathsPrefixes = [
    "5. JOURNAL/5.10 DAILY/",
    "3. RESOURCES/3.80 PEOPLE/",
  ];

  private clearScriptPath =
    "/Users/support/Library/Services/outlook_clear_triage_by_id.scpt";

  constructor(app: App) {
    this.app = app;
  }

  /** À appeler sur vault.on("modify") */
  onFileModified(file: TFile) {
    if (file.extension !== "md") return;

    const path = file.path;
    if (!this.onlyPathsPrefixes.some((p) => path.startsWith(p))) return;

    const prev = this.timers.get(path);
	if (prev) nodeClearTimeout(prev);

	const t = nodeSetTimeout(() => {
	  void this.processFile(file).catch((e) => {
	    console.error("[EIS][OutlookSync] processFile failed", e);
	  });
	}, this.debounceMs);

	this.timers.set(path, t);
  }

  /** Optionnel : à appeler sur delete/rename pour éviter cache stale */
  onFileDeleted(path: string) {
    this.lastStateByPath.delete(path);
    const t = this.timers.get(path);
	if (t) nodeClearTimeout(t);
    this.timers.delete(path);
  }

  onFileRenamed(oldPath: string, newPath: string) {
    const prev = this.lastStateByPath.get(oldPath);
    if (prev) {
      this.lastStateByPath.set(newPath, prev);
      this.lastStateByPath.delete(oldPath);
    }
    const t = this.timers.get(oldPath);
    if (t) {
      this.timers.set(newPath, t);
      this.timers.delete(oldPath);
    }
  }

  private async processFile(file: TFile) {
    const path = file.path;
    const content = await this.app.vault.read(file);

    // fast path perf
    if (!content.includes("#outlook") || !content.includes("hook://outlook/")) {
      this.lastStateByPath.set(path, new Map());
      return;
    }

    const nextMap = this.extractOutlookTaskStates(content);
    const prevMap = this.lastStateByPath.get(path);

    // 1ère fois => init cache
    if (!prevMap) {
      this.lastStateByPath.set(path, nextMap);
      return;
    }

    // transitions : prev done=false -> next done=true
    const toClear: string[] = [];
    for (const [id, nextState] of nextMap.entries()) {
      const prevState = prevMap.get(id);
      if (!prevState) continue;

      const transitionedToDone =
        prevState.hasOutlook &&
        nextState.hasOutlook &&
        prevState.done === false &&
        nextState.done === true;

      if (transitionedToDone) toClear.push(id);
    }

    if (toClear.length) {
      console.log("[EIS][OutlookSync] triage clear", { path, ids: toClear });
      for (const id of toClear) {
        await this.clearOutlookTriageById(id);
      }
    }

    this.lastStateByPath.set(path, nextMap);
  }

  private extractOutlookTaskStates(content: string): Map<string, TaskState> {
    const map = new Map<string, TaskState>();
    const lines = content.split("\n");

    for (const line of lines) {
      // skip rapide
      if (!line.includes("hook://outlook/")) continue;

      const id = this.extractOutlookIdFromLine(line);
      if (!id) continue;

      const hasOutlook = this.hasOutlookTag(line);
      if (!hasOutlook) continue; // tu as dit : identifiant + #outlook requis

      const done = this.isCheckedTask(line);

      map.set(id, { done, hasOutlook: true });
    }

    return map;
  }

  private isCheckedTask(line: string): boolean {
    return /^\s*[-*+]\s+\[x\]\s+/i.test(line);
  }

  private hasOutlookTag(line: string): boolean {
    return /(^|\s)#outlook(\b)/i.test(line);
  }

  private extractOutlookIdFromLine(line: string): string | null {
    const m = line.match(/hook:\/\/outlook\/(\d+)/i);
    return m ? m[1] : null;
  }

  private async clearOutlookTriageById(outlookId: string): Promise<void> {
    try {
      const req = (window as any).require ?? require;
      const { execFile } = req("child_process");

      await new Promise<void>((resolve, reject) => {
        execFile(
          "/usr/bin/osascript",
          [this.clearScriptPath, outlookId],
          (err: any, stdout: any, stderr: any) => {
            if (err) {
              console.error("[EIS][OutlookSync] clear failed", {
                outlookId,
                err,
                stdout,
                stderr,
              });
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    } catch (e) {
      console.error("[EIS][OutlookSync] clear failed (exception)", e);
      new Notice("EIS: sync Outlook impossible (voir console).");
    }
  }
}
