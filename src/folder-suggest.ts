import { App, TFolder, AbstractInputSuggest } from "obsidian";

/**
 * An input suggest that auto-completes folder paths from the vault.
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
  private onSelectCb: (value: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onSelect: (value: string) => void) {
    super(app, inputEl);
    this.onSelectCb = onSelect;
  }

  getSuggestions(query: string): string[] {
    const q = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder)
      .filter((f) => f.path.toLowerCase().contains(q) && !f.path.startsWith("."))
      .slice(0, 20)
      .map((f) => f.path);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value || "(vault root)");
  }

  selectSuggestion(value: string): void {
    this.onSelectCb(value || "");
    this.inputEl.blur();
  }
}
