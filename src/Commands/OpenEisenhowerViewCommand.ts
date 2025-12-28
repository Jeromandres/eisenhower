import { App, Command } from "obsidian";
import { EisenhowerView } from "../Views/EisenhowerView";

export class OpenEisenhowerViewCommand implements Command {
  id = "open-eisenhower-view";
  name = "Open Eisenhower View";

  constructor(private app: App) {}

  callback = async () => {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: EisenhowerView.viewType, active: true });
    this.app.workspace.revealLeaf(leaf);
  };
}
