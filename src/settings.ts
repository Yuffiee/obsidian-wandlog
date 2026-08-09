import { App, PluginSettingTab, Setting } from "obsidian";
import { FolderSuggest } from "./folder-suggest";
import { t } from "./i18n";
import type WandlogPlugin from "./main";

export interface PluginSettings {
  trackFolders: string[];
  dailyWordTarget: number;
  cardFolders: string[];
  todoFolders: string[];
  openInNewTab: boolean;
  colorScheme: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  trackFolders: ["Journal"],
  dailyWordTarget: 500,
  cardFolders: [],
  todoFolders: [],
  openInNewTab: true,
  colorScheme: "green",
};

/**
 * Helper: add a text input with folder auto-complete for comma-separated folder lists.
 */
function addFolderListSetting(
  container: HTMLElement,
  name: string,
  desc: string,
  currentValue: string[],
  placeholder: string,
  app: App,
  onChange: (val: string[]) => Promise<void>,
) {
  new Setting(container)
    .setName(name)
    .setDesc(desc)
    .addText((text) => {
      text
        .setPlaceholder(placeholder)
        .setValue(currentValue.join(", "))
        .onChange(async (val) => {
          const folders = val
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          await onChange(folders);
        });

      new FolderSuggest(app, text.inputEl, (selected) => {
        const raw = text.getValue().trim();
        const folders = raw
          ? raw.split(",").map((s) => s.trim()).filter((s) => s)
          : [];
        if (!folders.includes(selected)) {
          folders.push(selected);
        }
        text.setValue(folders.join(", "));
        text.onChanged();
      });
    });
}

export class WandlogSettingTab extends PluginSettingTab {
  plugin: WandlogPlugin;
  constructor(app: App, plugin: WandlogPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Heatmap section ──
    new Setting(containerEl).setName(t("📊 热力图", "📊 Heatmap")).setHeading();

    addFolderListSetting(
      containerEl,
      t("追踪文件夹", "Track Folders"),
      t(
        "用于统计每日字数的文件夹，输入时自动匹配 vault 中的文件夹",
        "Folders to track for daily word count.",
      ),
      this.plugin.settings.trackFolders,
      "Journal",
      this.app,
      async (folders) => {
        this.plugin.settings.trackFolders =
          folders.length > 0 ? folders : ["Journal"];
        await this.plugin.saveSettings();
      },
    );

    new Setting(containerEl)
      .setName(t("每日目标", "Daily Target"))
      .setDesc(t("字数用于热力图配色", "Word count used for heatmap colors"))
      .addSlider((slider) =>
        slider
          .setLimits(100, 5000, 100)
          .setValue(this.plugin.settings.dailyWordTarget)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.dailyWordTarget = val;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("颜色主题", "Color Scheme"))
      .setDesc(t("热力图的配色方案", "Heatmap color palette"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("green", t("默认", "Default"))
          .addOption("blue", t("海洋", "Ocean"))
          .addOption("purple", t("薰衣草", "Lavender"))
          .addOption("warm", t("日落", "Sunset"))
          .addOption("teal", t("薄荷", "Mint"))
          .setValue(this.plugin.settings.colorScheme)
          .onChange(async (val) => {
            this.plugin.settings.colorScheme = val;
            await this.plugin.saveSettings();
          }),
      );

    // ── Random Walk section ──
    new Setting(containerEl).setName(t("🎲 随机漫步", "🎲 Random")).setHeading();

    addFolderListSetting(
      containerEl,
      t("卡片来源文件夹", "Card Folders"),
      t(
        "随机漫步卡片从这些文件夹中抽取，输入时自动匹配 vault 中的文件夹",
        "Random walk cards are picked from these folders.",
      ),
      this.plugin.settings.cardFolders,
      "Journal, Project",
      this.app,
      async (folders) => {
        this.plugin.settings.cardFolders = folders;
        await this.plugin.saveSettings();
      },
    );

    // ── Todo section ──
    new Setting(containerEl).setName(t("☑️ 待办事项", "☑️ Todo")).setHeading();

    addFolderListSetting(
      containerEl,
      t("待办文件夹", "Todo Folders"),
      t(
        "在这些文件夹中查找未完成的任务",
        "Find unchecked tasks in these folders",
      ),
      this.plugin.settings.todoFolders,
      "Journal",
      this.app,
      async (folders) => {
        this.plugin.settings.todoFolders = folders;
        await this.plugin.saveSettings();
      },
    );

    // ── Interaction section ──
    new Setting(containerEl).setName(t("🔗 交互", "🔗 Interaction")).setHeading();

    new Setting(containerEl)
      .setName(t("打开方式", "Open In"))
      .setDesc(
        t(
          "点击日期方块、卡片或待办事项时在新标签页还是当前标签页打开",
          "Open in new tab or current tab on click",
        ),
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("new", t("新标签页", "New Tab"))
          .addOption("current", t("当前标签页", "Current Tab"))
          .setValue(this.plugin.settings.openInNewTab ? "new" : "current")
          .onChange(async (val) => {
            this.plugin.settings.openInNewTab = val === "new";
            await this.plugin.saveSettings();
          }),
      );
  }
}
