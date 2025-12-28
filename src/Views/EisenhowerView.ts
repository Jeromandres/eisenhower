import { ItemView, WorkspaceLeaf } from "obsidian";

export const EISENHOWER_VIEW_TYPE = "eisenhower-view";

export class EisenhowerView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return EISENHOWER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Eisenhower Matrix";
  }

  async onOpen() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Eisenhower Matrix" });
    containerEl.createEl("p", {
      text: "View loaded. Next: 2×2 grid + drag & drop."
    });
  }

  async onClose() {
    this.containerEl.empty();
  }
}
