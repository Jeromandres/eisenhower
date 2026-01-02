import { App, Notice, TFile } from "obsidian";

type Timer = ReturnType<typeof window.setTimeout>;

export class OutlookTriageSync {
  private app: App;

  // cache dernier contenu par fichier (pour détecter transitions)
  private lastByPath = new Map<string, string>();

  // debounce par fichier
  private timers = new Map<string, Timer>();

  // réglages
  private debounceMs = 800;

  // filtre perf (ajuste si tu veux plus large)
 private onlyPathsPrefixes = [
  "5. JOURNAL/5.10 DAILY/",
  "3. RESOURCES/3.80 PEOPLE/",
 ];
	// script AppleScript (celui que tu as déjà)
  private clearScriptPath = "/Users/support/Library/Services/outlook_clear_triage_by_id.scpt";

  constructor(app: App) {
    this.app = app;
  }

  /** À appeler sur "modify" */
onFileModified(file: TFile) {
  if (file.extension !== "md") return;

  const path = file.path;
  if (!this.onlyPathsPrefixes.some((p) => path.startsWith(p))) return;

  // debounce par fichier (inchangé)
  const prev = this.timers.get(path);
  if (prev) window.clearTimeout(prev);

  const t = window.setTimeout(() => {
    void this.processFile(file).catch((e) => {
      console.error("[EIS] Outlook sync: processFile failed", e);
    });
  }, this.debounceMs);

  this.timers.set(path, t);
}

  private async processFile(file: TFile) {
    const path = file.path;

    const content = await this.app.vault.read(file);

    // fast path perf: si pas #outlook ou pas de hook outlook, inutile
    if (!content.includes("#outlook") || !content.includes("hook://outlook/")) {
      this.lastByPath.set(path, content);
      return;
    }

    const prev = this.lastByPath.get(path);

    // 1ère fois => on initialise juste le cache
    if (prev == null) {
      this.lastByPath.set(path, content);
      return;
    }

    // Détection transitions "- [ ]" -> "- [x]" sur lignes Outlook
    const ids = this.detectCheckedTransitions(prev, content);

    if (ids.length) {
      console.log("[EIS] Outlook triage clear (checked tasks)", { path, ids });

      // exécute en série (plus simple, plus sûr)
      for (const id of ids) {
        await this.clearOutlookTriageById(id);
      }
    }

    this.lastByPath.set(path, content);
  }

  private detectCheckedTransitions(prev: string, next: string): string[] {
    const prevLines = prev.split("\n");
    const nextLines = next.split("\n");

    const n = Math.max(prevLines.length, nextLines.length);
    const out = new Set<string>();

    for (let i = 0; i < n; i++) {
      const a = prevLines[i] ?? "";
      const b = nextLines[i] ?? "";

      // Transition unchecked -> checked
      const wasTodo = this.isUncheckedTask(a);
      const isDone = this.isCheckedTask(b);

      if (!wasTodo || !isDone) continue;

      // doit être Outlook
      if (!this.hasOutlookTag(b)) continue;

      const id = this.extractOutlookIdFromLine(b);
      if (id) out.add(id);
    }

    return [...out];
  }

  private isUncheckedTask(line: string): boolean {
    return /^\s*[-*+]\s+\[\s\]\s+/.test(line);
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
              console.error("[EIS] Outlook clear failed", { outlookId, err, stdout, stderr });
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    } catch (e) {
      console.error("[EIS] Outlook clear failed (exception)", e);
      new Notice("EIS: sync Outlook impossible (voir console).");
    }
  }
}
