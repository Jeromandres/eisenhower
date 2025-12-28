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

    containerEl.createEl("h2", { text: "Eisenhower Matrix" });
    containerEl.createEl("p", { text: "View loaded." });

    this.deps.logger?.info?.("Eisenhower view rendered");
  }

  async onOpen() {
    this.render();
  }

  async onClose() {
    this.containerEl.empty();
  }
}
