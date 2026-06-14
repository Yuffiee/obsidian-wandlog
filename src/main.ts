import { Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings, WandlogSettingTab } from "./settings";
import { Indexer, IndexerCache } from "./indexer";
import { WandlogView, VIEW_TYPE } from "./view";
import { t } from "./i18n";

interface SavedData {
  indexerCache?: IndexerCache;
  settings?: Record<string, unknown>;
}

export default class WandlogPlugin extends Plugin {
  settings!: PluginSettings;
  indexer!: Indexer;
  view: WandlogView | null = null;
  private refreshTimeout: number | null = null;

  /** Lazily resolve the view instance from workspace leaves. */
  private get activeView(): WandlogView | null {
    if (this.view) return this.view;
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length > 0) {
      this.view = leaves[0].view as WandlogView;
      return this.view;
    }
    return null;
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    this.indexer = new Indexer(this.app, this.settings);

    const saved = await this.loadData();
    await this.indexer.initialize((saved as SavedData)?.indexerCache);

    // Register the side-bar view
    this.registerView(VIEW_TYPE, (leaf) => {
      return new WandlogView(leaf, this);
    });

    // Ribbon icon
    this.addRibbonIcon("footprints", t("Wandlog", "Wandlog"), () => {
      void this.activateView();
    });

    // Commands
    this.addCommand({
      id: "open",
      name: t("打开 Wandlog", "Open Wandlog"),
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "refresh-cards",
      name: t("刷新随机卡片", "Refresh Random Cards"),
      callback: () => this.activeView?.refreshCards(),
    });

    // Settings tab
    this.addSettingTab(new WandlogSettingTab(this.app, this));

    // File change events
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.indexer.onFileChanged(file);
          this.debounceRefresh();
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.indexer.onFileCreated(file);
          this.activeView?.invalidateDatesCache();
          this.activeView?.invalidateDailyNoteCache();
          this.debounceRefresh();
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.indexer.onFileDeleted(file.path);
          this.activeView?.invalidateDatesCache();
          this.activeView?.invalidateDailyNoteCache();
          this.debounceRefresh();
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile && file.extension === "md") {
          this.indexer.onFileRenamed(file, oldPath);
          this.debounceRefresh();
        }
      }),
    );

    // Auto-save cache every 30s
    this.registerInterval(window.setInterval(() => void this.persistCache(), 30_000));

    // Activate view once layout is ready
    this.app.workspace.onLayoutReady(() => {
      void this.activateView();
    });
  }

  onunload(): void {
    void this.persistCache();
  }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData();
    const raw = (saved as SavedData)?.settings || {};

    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      indexerCache: this.indexer.getCache(),
    });
    await this.indexer.updateSettings(this.settings);
    this.activeView?.onSettingsChanged();
  }

  async persistCache(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      indexerCache: this.indexer.getCache(),
    });
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE);

    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  private debounceRefresh(): void {
    if (this.refreshTimeout !== null) {
      window.clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = window.setTimeout(() => {
      void this.activeView?.refreshHeatmap();
      void this.activeView?.refreshCards();
      void this.activeView?.refreshTodos();
    }, 500);
  }
}
