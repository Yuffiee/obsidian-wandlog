import { Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings, WandlogSettingTab } from "./settings";
import { Indexer, IndexerCache } from "./indexer";
import { WandlogView, VIEW_TYPE } from "./view";
import { t } from "./i18n";

export default class WandlogPlugin extends Plugin {
  settings!: PluginSettings;
  indexer!: Indexer;
  view: WandlogView | null = null;
  private refreshTimeout: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.indexer = new Indexer(this.app, this.settings);

    const saved = await this.loadData();
    await this.indexer.initialize((saved as any)?.indexerCache);

    // Register the side-bar view
    this.registerView(VIEW_TYPE, (leaf) => {
      this.view = new WandlogView(leaf, this);
      return this.view;
    });

    // Ribbon icon
    this.addRibbonIcon("footprints", t("Wandlog", "Wandlog"), () => {
      this.activateView();
    });

    // Commands
    this.addCommand({
      id: "open-wandlog",
      name: t("打开 Wandlog", "Open Wandlog"),
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "refresh-cards",
      name: t("刷新随机卡片", "Refresh Random Cards"),
      callback: () => this.view?.refreshCards(),
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
          this.view?.invalidateDatesCache();
          this.view?.invalidateDailyNoteCache();
          this.debounceRefresh();
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.indexer.onFileDeleted(file.path);
          this.view?.invalidateDatesCache();
          this.view?.invalidateDailyNoteCache();
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
    this.registerInterval(window.setInterval(() => this.persistCache(), 30_000));

    // Activate view once layout is ready
    this.app.workspace.onLayoutReady(() => {
      this.activateView();
    });
  }

  async onunload(): Promise<void> {
    await this.persistCache();
  }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData();
    const raw = (saved as any)?.settings || {};

    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      indexerCache: this.indexer.getCache(),
    });
    await this.indexer.updateSettings(this.settings);
    this.view?.onSettingsChanged();
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
      clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = window.setTimeout(() => {
      this.view?.refreshHeatmap();
      this.view?.refreshCards();
      this.view?.refreshTodos();
    }, 500);
  }
}
