import { App, TFile } from "obsidian";
import { dateFromFilename, extractLeafItems, LeafItem, sleep, stripFrontMatter, wordCount, arrayEqual } from "./utils";
import type { PluginSettings } from "./settings";

export interface IndexerCache {
  lastFullScan: number;
  leafItems: Record<string, LeafItem[]>;
  dailyWordCounts: Record<string, number>;
}

export interface TaskItem {
  filePath: string;
  lineNumber: number;
  text: string;
  cleanText: string;
}

const BATCH_SIZE = 20;

/**
 * Scans markdown files to build a searchable index of list items and daily word counts.
 */
export class Indexer {
  private app: App;
  private settings: PluginSettings;
  private cache: IndexerCache;
  /** Cache of unchecked tasks per file — built lazily, updated incrementally on file events. */
  private tasksCache: Record<string, TaskItem[]> | null = null;
  private tasksFoldersKey = "";

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
    this.cache = {
      lastFullScan: 0,
      leafItems: {},
      dailyWordCounts: {},
    };
  }

  getCache(): IndexerCache {
    return this.cache;
  }

  async initialize(cached?: IndexerCache): Promise<void> {
    if (cached) this.cache = cached;
    await this.fullScan();
  }

  private async fullScan(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    const now = Date.now();

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((f) => this.indexFile(f)));
      await sleep(0);
    }

    this.cache.lastFullScan = now;
  }

  private async indexFile(file: TFile): Promise<void> {
    const filePath = file.path;
    const isTracked = this.isInFolders(filePath, this.settings.trackFolders);
    const isCardSource = this.isInFolders(filePath, this.settings.cardFolders);
    // Short-circuit: skip files outside both card and track folders without reading them
    if (!isTracked && !isCardSource) return;

    const name = file.name;
    let content: string;

    try {
      content = await this.app.vault.cachedRead(file);
    } catch {
      console.warn(`[Wandlog] Failed to read: ${filePath}`);
      return;
    }

    // Index list items (source for random walk cards)
    if (isCardSource) {
      this.cache.leafItems[filePath] = extractLeafItems(content, filePath);
    } else {
      delete this.cache.leafItems[filePath];
    }

    // Index daily word count
    if (isTracked) {
      const d = dateFromFilename(name);
      if (d) {
        const body = stripFrontMatter(content);
        this.cache.dailyWordCounts[d] = wordCount(body);
      }
    }
  }

  onFileChanged(file: TFile): void {
    if (file.extension !== "md") return;
    void this.indexFile(file);
    void this.indexTasksForFile(file);
  }

  onFileDeleted(filePath: string): void {
    delete this.cache.leafItems[filePath];
    if (this.tasksCache) delete this.tasksCache[filePath];
    const fileName = filePath.split("/").pop() || "";
    const d = dateFromFilename(fileName);
    if (d) delete this.cache.dailyWordCounts[d];
  }

  onFileCreated(file: TFile): void {
    if (file.extension !== "md") return;
    void this.indexFile(file);
    void this.indexTasksForFile(file);
  }

  onFileRenamed(file: TFile, oldPath: string): void {
    this.onFileDeleted(oldPath);
    void this.indexFile(file);
    void this.indexTasksForFile(file);
  }

  async updateSettings(settings: PluginSettings): Promise<void> {
    const oldTrack = this.settings.trackFolders;
    const oldCard = this.settings.cardFolders;
    const oldTodo = this.settings.todoFolders;
    this.settings = settings;

    if (!arrayEqual(oldTodo, settings.todoFolders)) {
      this.tasksCache = null;
    }
    if (!arrayEqual(oldTrack, settings.trackFolders) || !arrayEqual(oldCard, settings.cardFolders)) {
      await this.fullScan();
    }
  }

  getAllLeafItems(): LeafItem[] {
    const all: LeafItem[] = [];
    for (const items of Object.values(this.cache.leafItems)) {
      all.push(...items);
    }
    return all;
  }

  getFilteredLeafItems(): LeafItem[] {
    return this.getAllLeafItems();
  }

  /**
   * Find unchecked tasks from the specified folders.
   * Uses a per-file cache that is updated incrementally on file events;
   * a full rescan only happens when the folder set changes.
   */
  async getUncheckedTasks(folders: string[]): Promise<TaskItem[]> {
    if (folders.length === 0) return [];

    const key = folders.join("\u0000");
    if (this.tasksCache && this.tasksFoldersKey === key) {
      return this.flattenTasks();
    }

    // Rebuild the cache
    this.tasksCache = {};
    this.tasksFoldersKey = key;
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (!this.isInFolders(file.path, folders)) continue;
      const tasks = await this.extractTasks(file);
      if (tasks.length > 0) this.tasksCache[file.path] = tasks;
    }
    return this.flattenTasks();
  }

  /** Re-scan one file's tasks after it was modified by the plugin (keep cache in sync). */
  async rescanFileTasks(filePath: string): Promise<void> {
    if (!this.tasksCache) return;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      await this.indexTasksForFile(file);
    } else {
      delete this.tasksCache[filePath];
    }
  }

  private async indexTasksForFile(file: TFile): Promise<void> {
    if (!this.tasksCache) return;
    if (!this.isInFolders(file.path, this.settings.todoFolders)) {
      delete this.tasksCache[file.path];
      return;
    }
    const tasks = await this.extractTasks(file);
    if (tasks.length > 0) {
      this.tasksCache[file.path] = tasks;
    } else {
      delete this.tasksCache[file.path];
    }
  }

  private flattenTasks(): TaskItem[] {
    const result: TaskItem[] = [];
    if (!this.tasksCache) return result;
    for (const items of Object.values(this.tasksCache)) {
      result.push(...items);
    }
    return result;
  }

  private async extractTasks(file: TFile): Promise<TaskItem[]> {
    const result: TaskItem[] = [];
    let content: string;
    try {
      content = await this.app.vault.cachedRead(file);
    } catch (e) {
      console.warn("[Wandlog] Failed to read file for tasks:", (e as Error)?.message || e);
      return result;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      // Match: "- [ ] something", "* [ ] something", or "  - [ ] indented"
      const taskMatch = lines[i].match(/^(\s*)[-*+]\s+\[\s\]\s+(.+)/u);
      if (taskMatch) {
        result.push({
          filePath: file.path,
          lineNumber: i,
          text: lines[i].trim(),
          cleanText: taskMatch[2].trim(),
        });
      }
    }
    return result;
  }

  getDailyWordCounts(): Record<string, number> {
    return { ...this.cache.dailyWordCounts };
  }

  private isInFolders(path: string, folders: string[]): boolean {
    for (const folder of folders) {
      if (path === folder || path.startsWith(folder + "/")) return true;
    }
    return false;
  }
}
