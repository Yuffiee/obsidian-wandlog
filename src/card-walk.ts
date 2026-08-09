import { App, Menu, Notice, Modal } from "obsidian";
import { t } from "./i18n";
import { LeafItem, shortPath, shuffle } from "./utils";

/** Minimal interface for Obsidian's internal Setting API. */
interface AppSetting {
  open(): void;
  openTabById(id: string): void;
}

/**
 * Picks and renders a single random card.
 */
export class CardWalk {
  private container: HTMLElement;
  private onCardClick: (item: LeafItem) => void;
  private onRefresh: () => void;
  private app: App;

  private allItems: LeafItem[] = [];

  constructor(
    container: HTMLElement,
    onCardClick: (item: LeafItem) => void,
    onRefresh: () => void,
    app: App,
  ) {
    this.container = container;
    this.onCardClick = onCardClick;
    this.onRefresh = onRefresh;
    this.app = app;
  }

  setItems(items: LeafItem[]): void {
    this.allItems = items;
  }

  refresh(): void {
    const card = this.pickOne();
    this.renderCard(card);
  }

  /** Pick one random item from allItems. */
  private pickOne(): LeafItem | null {
    if (this.allItems.length === 0) return null;

    // Deduplicate by cleanText first
    const seen = new Set<string>();
    const unique: LeafItem[] = [];
    for (const item of this.allItems) {
      if (seen.has(item.cleanText)) continue;
      seen.add(item.cleanText);
      unique.push(item);
    }

    const shuffled = shuffle(unique);
    return shuffled[0] ?? null;
  }

  private renderCard(card: LeafItem | null): void {
    this.container.empty();
    this.container.addClass("tm-cards-container");

    if (!card) {
      const emptyEl = this.container.createDiv("tm-cards-empty");
      emptyEl.setText(
        t(
          "暂无符合条件的摘录。\n请在设置中指定卡片来源文件夹。",
          "No matching items found.\nSet card folders in settings.",
        ),
      );
      const settingsBtn = emptyEl.createEl("button", { cls: "tm-settings-link" });
      settingsBtn.setText(t("打开设置", "Open Settings"));
      settingsBtn.addEventListener("click", () => {
        const setting = (this.app as { setting: AppSetting }).setting;
        setting.open();
        setting.openTabById("wandlog");
      });
      return;
    }

    const container = this.container.createDiv("tm-card-single");
    const displayText = card.cleanText;

    container.createSpan({ cls: "tm-card-text", text: displayText });
    container.createSpan({ cls: "tm-card-meta", text: shortPath(card.filePath) });

    container.addEventListener("click", () => {
      this.onCardClick(card);
    });

    container.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      new Menu()
        .addItem((menuItem) =>
          menuItem
            .setTitle(t("复制到剪贴板", "Copy to clipboard"))
            .setIcon("copy")
            .onClick(async () => {
              await navigator.clipboard.writeText(card.cleanText);
              new Notice(t("已复制", "Copied"));
            }),
        )
        .addItem((menuItem) =>
          menuItem
            .setTitle(t("删除", "Delete"))
            .setIcon("trash")
            .setWarning(true)
            .onClick(() =>
              new ConfirmModal(
                this.app,
                t("确认删除？", "Delete this card?"),
                () => this.deleteItem(card),
              ).open(),
            ),
        )
        .showAtMouseEvent(e);
    });

    container.setAttr("tabindex", "0");
    container.setAttr("role", "button");
  }

  private async deleteItem(item: LeafItem): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(item.filePath);
      if (!file) {
        new Notice(`File not found: ${item.filePath}`);
        return;
      }

      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const lineIndex = lines.findIndex((line) => line.trim() === item.text);
      if (lineIndex === -1) {
        new Notice(t("未找到匹配的行", "Line not found"));
        return;
      }

      lines.splice(lineIndex, 1);
      const newContent = lines.join("\n");
      await this.app.vault.modify(file, newContent);

      this.allItems = this.allItems.filter(
        (it) => !(it.filePath === item.filePath && it.cleanText === item.cleanText),
      );

      new Notice(t("已删除", "Deleted"));
      this.refresh();
    } catch (e) {
      console.error("[Wandlog] Delete failed:", e);
      new Notice(t("删除失败", "Delete failed"));
    }
  }
}

class ConfirmModal extends Modal {
  private message: string;
  private onConfirm: () => void;

  constructor(app: App, message: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.message });
    const btnRow = contentEl.createDiv("modal-button-container");
    btnRow
      .createEl("button", { text: t("取消", "Cancel"), cls: "mod-cta" })
      .addEventListener("click", () => this.close());
    btnRow
      .createEl("button", { text: t("删除", "Delete"), cls: "mod-warning" })
      .addEventListener("click", () => {
        this.onConfirm();
        this.close();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
