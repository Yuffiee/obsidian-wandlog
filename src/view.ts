import { App, TFile } from "obsidian";
import { ItemView, Menu, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { t } from "./i18n";
import { dateFromFilename, shortPath } from "./utils";
import { Heatmap } from "./heatmap";
import { CardWalk } from "./card-walk";
import type WandlogPlugin from "./main";
import type { TaskItem } from "./indexer";

/** Minimal interface for Obsidian's CodeMirror editor. */
interface EditorLike {
  setCursor(pos: { line: number; ch: number }): void;
  scrollIntoView(range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center: boolean): void;
  getCursor(): { line: number; ch: number };
}

export const VIEW_TYPE = "wandlog-view";

export class WandlogView extends ItemView {
  private plugin: WandlogPlugin;
  private heatmap: Heatmap | null = null;
  private cardWalk: CardWalk | null = null;
  private todoInner: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: WandlogPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("Wandlog", "Wandlog");
  }

  getIcon(): string {
    return "footprints";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("tm-view-container");

    // Loading indicator (shown during initial index)
    const loadingEl = container.createDiv("tm-loading");
    loadingEl.createDiv("tm-loading-spinner");
    loadingEl.createSpan({ text: t("正在索引笔记…", "Indexing notes…") });

    // ── Heatmap section ──
    const heatmapSection = container.createDiv("tm-section");
    this.makeSectionHeader(heatmapSection, t("📊 热力图", "📊 Heatmap"));
    const heatmapInner = heatmapSection.createDiv("tm-heatmap-inner");

    this.heatmap = new Heatmap(
      heatmapInner,
      this.plugin.settings.dailyWordTarget,
      this.plugin.settings.colorScheme,
      (date) => this.openDailyNote(date),
    );

    // ── Random Walk section ──
    const cardSection = container.createDiv("tm-section tm-cards-section");
    const cardHeader = this.makeSectionHeader(cardSection, t("🎲 随机漫步", "🎲 Random"));
    // Add 🎲 button
    const diceBtn = cardHeader.createEl("button", {
      cls: "tm-dice-btn",
    });
    setIcon(diceBtn, "dice");
    diceBtn.setAttr("aria-label", t("换一张", "Next card"));
    diceBtn.addEventListener("click", () => this.refreshCards());

    const cardInner = cardSection.createDiv("tm-cards-inner");

    this.cardWalk = new CardWalk(
      cardInner,
      (item) => this.openSourceFile(item),
      () => this.refreshCards(),
      this.app,
    );

    // ── Todo section ──
    const todoSection = container.createDiv("tm-section tm-todo-section");
    this.makeSectionHeader(todoSection, t("☑️ 待办事项", "☑️ Todo"));
    const todoInner = todoSection.createDiv("tm-todo-inner");
    this.todoInner = todoInner;

    this.refreshHeatmap();
    this.refreshCards();
    this.refreshTodos();

    // Hide loading once data is available
    loadingEl.addClass("tm-loading-done");
  }

  async onClose(): Promise<void> {
    this.heatmap?.destroy();
    this.heatmap = null;
    this.cardWalk = null;
  }

  refreshHeatmap(): void {
    if (!this.heatmap) return;
    const counts = this.plugin.indexer.getDailyWordCounts();
    const dates = this.buildExistingDatesSet();
    this.heatmap.render(counts, dates);
  }

  invalidateDatesCache(): void {
    this.dailyNoteCache = null;
  }

  refreshCards(): void {
    if (!this.cardWalk) return;
    const items = this.plugin.indexer.getFilteredLeafItems();
    this.cardWalk.setItems(items);
    this.cardWalk.refresh();
  }

  onSettingsChanged(cardChanged = false): void {
    if (this.heatmap) {
      this.heatmap.updateTarget(this.plugin.settings.dailyWordTarget);
      this.heatmap.updateScheme(this.plugin.settings.colorScheme);
    }
    this.refreshHeatmap();
    // Refresh cards only when their source folders changed (otherwise cards stay fixed until 🎲)
    if (cardChanged) this.refreshCards();
    this.refreshTodos();
  }

  async refreshTodos(): Promise<void> {
    try {
      if (!this.todoInner) return;
      this.todoInner.empty();

      const folders = this.plugin.settings.todoFolders;
      if (folders.length === 0) {
        this.todoInner.createDiv("tm-todo-empty").setText(
          t("请在设置中指定待办文件夹", "Set todo folders in settings"),
        );
        return;
      }

      const tasks = await this.plugin.indexer.getUncheckedTasks(folders);

      if (tasks.length === 0) {
        this.todoInner.createDiv("tm-todo-empty").setText(
          t("没有未完成的任务", "No unchecked tasks"),
        );
        return;
      }

      const section = this.todoInner.closest(".tm-section");
      const titleEl = section?.querySelector(".tm-section-title");
      if (titleEl) {
        titleEl.textContent = t("☑️ 待办事项", "☑️ Todo") + ` (${tasks.length})`;
      }

      const list = this.todoInner.createEl("ul", { cls: "tm-todo-list" });
      for (const task of tasks) {
        const li = list.createEl("li", { cls: "tm-todo-item" });
        const cb = li.createEl("span", { cls: "tm-todo-checkbox" });
        cb.setAttr("role", "checkbox");
        cb.setAttr("aria-checked", "false");
        cb.setAttr("aria-label", t("标记完成", "Mark done"));
        cb.addEventListener("click", (e) => {
          e.stopPropagation();
          this.markTaskComplete(task);
        });

        // Parse and render todo text with tag and link highlighting (per-char scan)
        const textSpan = li.createSpan({ cls: "tm-todo-text" });
        let ti = 0;
        while (ti < task.cleanText.length) {
          const rest = task.cleanText.slice(ti);
          const tagMatch = rest.match(/^#([^\s#]+)/);
          const linkMatch = rest.match(/^\[\[([^\]]+)\]\]/);

          if (tagMatch) {
            textSpan.createSpan({ cls: "tm-todo-tag", text: `#${tagMatch[1]}` });
            ti += tagMatch[0].length;
          } else if (linkMatch) {
            const linkName = linkMatch[1];
            const displayText = linkName.includes("|") ? linkName.split("|")[1] : linkName;
            const linkSpan = textSpan.createSpan({ cls: "tm-todo-link", text: displayText });
            linkSpan.addEventListener("click", (e) => {
              e.stopPropagation();
              this.openTodoLink(linkName, task.filePath);
            });
            ti += linkMatch[0].length;
          } else {
            const nextTag = rest.indexOf("#");
            const nextLink = rest.indexOf("[[");
            const stops = [nextTag, nextLink].filter((n) => n !== -1);
            let end = stops.length > 0 ? Math.min(...stops) : rest.length;
            if (end === 0) end = 1;
            textSpan.createSpan({ text: rest.slice(0, end) });
            ti += end;
          }
        }

        textSpan.addEventListener("click", () => this.openSourceFile(task));
        li.createSpan({ cls: "tm-todo-meta", text: shortPath(task.filePath) });

        li.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          new Menu()
            .addItem((item) =>
              item
                .setTitle(t("复制到剪贴板", "Copy to clipboard"))
                .setIcon("copy")
                .onClick(async () => {
                  await navigator.clipboard.writeText(task.cleanText);
                  new Notice(t("已复制", "Copied"));
                }),
            )
            .addItem((menuItem) =>
              menuItem
                .setTitle(t("删除", "Delete"))
                .setIcon("trash")
                .setWarning(true)
                .onClick(() => this.deleteTodo(task)),
            )
            .showAtMouseEvent(e);
        });

        li.setAttr("tabindex", "0");
        li.setAttr("role", "button");
      }
    } catch (e) {
      const msg = String(e).slice(0, 200);
      if (this.todoInner) {
        this.todoInner.createDiv("tm-todo-empty").setText(t("错误：" + msg, "Error: " + msg));
      }
      console.error("[Wandlog] refreshTodos error:", e);
    }
  }

  private async markTaskComplete(task: TaskItem): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!file) {
        new Notice(`File not found: ${task.filePath}`);
        return;
      }

      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const lineIndex = lines.findIndex((line) => line.trim() === task.text);

      if (lineIndex === -1) {
        new Notice(t("未找到匹配的行", "Line not found"));
        return;
      }

      lines[lineIndex] = lines[lineIndex].replace("[ ]", "[x]");
      await this.app.vault.modify(file, lines.join("\n"));

      // Sync the task cache right away so the refreshed list is accurate
      await this.plugin.indexer.rescanFileTasks(task.filePath);

      new Notice(t("已标记完成 ✅", "Marked done ✅"));
      this.refreshTodos();
    } catch (e) {
      console.error("[Wandlog] Mark task complete failed:", e);
      new Notice(t("操作失败", "Failed"));
    }
  }

  /** Create a simple static section header (no collapse). */
  private makeSectionHeader(section: HTMLElement, title: string): HTMLElement {
    const header = section.createDiv("tm-section-header");
    header.createSpan({ cls: "tm-section-title", text: title });
    return header;
  }

  private async deleteTodo(task: TaskItem): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!file) {
        new Notice(`File not found: ${task.filePath}`);
        return;
      }

      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const lineIndex = lines.findIndex((line) => line.trim() === task.text);
      if (lineIndex === -1) {
        new Notice(t("未找到匹配的行", "Line not found"));
        return;
      }

      lines.splice(lineIndex, 1);
      const newContent = lines.join("\n");
      await this.app.vault.modify(file, newContent);

      // Sync the task cache right away so the refreshed list is accurate
      await this.plugin.indexer.rescanFileTasks(task.filePath);

      new Notice(t("已删除", "Deleted"));
      this.refreshTodos();
    } catch (e) {
      console.error("[Wandlog] Delete todo failed:", e);
      new Notice(t("删除失败", "Delete failed"));
    }
  }

  private async openTodoLink(linkName: string, sourcePath: string): Promise<void> {
    const target = this.app.metadataCache.getFirstLinkpathDest(linkName, sourcePath);
    if (!target) {
      new Notice(`File not found: ${linkName}`);
      return;
    }

    const leaf = this.app.workspace.getLeaf(
      this.plugin.settings.openInNewTab ? "tab" : false,
    );
    await leaf.openFile(target);
  }

  /** Cached map of date→TFile for daily-note lookup. */
  private dailyNoteCache: Record<string, TFile> | null = null;

  private invalidateDailyNoteCache(): void { this.dailyNoteCache = null; }

  private buildDailyNoteMap(): Record<string, TFile> {
    if (this.dailyNoteCache) return this.dailyNoteCache;
    const map: Record<string, TFile> = {};
    const tracked = this.plugin.settings.trackFolders;
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      if (tracked.some((f) => file.path === f || file.path.startsWith(f + "/"))) {
        const d = dateFromFilename(file.name);
        if (d) map[d] = file;
        map[file.name.replace(/\.md$/, "")] = file;
        map[file.name.replace(/-/g, "").replace(/\.md$/, "")] = file;
      }
    }
    this.dailyNoteCache = map;
    return map;
  }

  private buildExistingDatesSet(): Set<string> {
    return new Set(Object.keys(this.buildDailyNoteMap()));
  }

  private async openDailyNote(date: string): Promise<void> {
    const leaf = this.app.workspace.getLeaf(
      this.plugin.settings.openInNewTab ? "tab" : false,
    );
    const map = this.buildDailyNoteMap();
    const file: TFile | undefined = map[date];
    if (file) {
      await leaf.openFile(file);
      return;
    }
    let note = this.app.vault.getAbstractFileByPath(date + ".md");
    if (!note) note = this.app.vault.getAbstractFileByPath(date.replace(/-/g, "") + ".md");
    if (note) await leaf.openFile(note);
  }

  private async openSourceFile(item: { filePath: string; lineNumber: number }): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(item.filePath);
    if (!file) {
      new Notice(`File not found: ${item.filePath}`);
      return;
    }

    const leaf = this.app.workspace.getLeaf(
      this.plugin.settings.openInNewTab ? "tab" : false,
    );
    await leaf.openFile(file);

    const activeView = leaf.view;
    const editor: EditorLike | undefined = (activeView as { editor?: EditorLike })?.editor;
    if (!editor) return;

    try {
      // Wait for editor to be ready, then set cursor and scroll
      const goToLine = () => {
        try {
          editor.setCursor({ line: item.lineNumber, ch: 0 });
          editor.scrollIntoView(
            { from: { line: item.lineNumber, ch: 0 }, to: { line: item.lineNumber, ch: 0 } },
            true,
          );
        } catch (e) {
          console.warn("[Wandlog] Failed to scroll to line:", e);
        }
      };
      // If editor is already live, go immediately; otherwise wait a frame
      if (typeof editor.getCursor === "function") {
        goToLine();
      } else {
        window.requestAnimationFrame(goToLine);
      }
    } catch (e) {
      console.warn("[Wandlog] Failed to open source file:", e);
    }
  }
}
