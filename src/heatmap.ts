import { t } from "./i18n";
import { dateString } from "./utils";

/**
 * Renders a GitHub-style heatmap calendar showing daily word counts.
 */
export class Heatmap {
  private container: HTMLElement;
  private dailyWordTarget: number;
  private colorScheme: string;
  private onDayClick: ((date: string) => void) | null;

  private resizeObserver: ResizeObserver | null = null;
  private lastDailyCounts: Record<string, number> = {};
  private lastExistingDates = new Set<string>();
  private renderTimer: number | null = null;
  private tooltipEl: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    dailyWordTarget: number,
    colorScheme: string,
    onDayClick?: (date: string) => void,
  ) {
    this.container = container;
    this.dailyWordTarget = dailyWordTarget;
    this.colorScheme = colorScheme;
    this.onDayClick = onDayClick ?? null;
  }

  updateTarget(target: number): void {
    this.dailyWordTarget = target;
    this.doRender();
  }

  updateScheme(scheme: string): void {
    this.colorScheme = scheme;
    this.doRender();
  }

  render(counts: Record<string, number>, existingDates: Set<string>): void {
    this.lastDailyCounts = counts;
    this.lastExistingDates = existingDates ?? new Set();

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
    this.resizeObserver.observe(this.container);

    this.doRender();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  private scheduleRender(): void {
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.doRender(), 100);
  }

  private doRender(): void {
    this.container.empty();
    this.container.addClass("tm-heatmap-container");
    // Apply color scheme
    const schemeClass = "tm-scheme-" + this.colorScheme;
    this.container.className.split(" ").forEach((cls) => {
      if (cls.startsWith("tm-scheme-") && cls !== schemeClass) {
        this.container.removeClass(cls);
      }
    });
    if (!this.container.hasClass(schemeClass)) {
      this.container.addClass(schemeClass);
    }

    const width = this.container.clientWidth;
    if (width < 20) return;

    const cols = Math.max(4, Math.floor(width / 20));
    const today = new Date();
    // Start so that today is always the last cell of the grid
    const start = new Date(today.getTime() - (cols * 7 - 1) * 86400000);

    // Build grid: (cols × 7) days, ending at today
    const weeks: { date: string; count: number }[][] = [];
    const cursor = new Date(start);
    for (let w = 0; w < cols; w++) {
      const week: { date: string; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        week.push({
          date: dateString(cursor),
          count: this.lastDailyCounts[dateString(cursor)] || 0,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }

    if (weeks.length === 0) return;

    const cells = this.container.createDiv("tm-heatmap-cells");
    cells.style.setProperty("grid-template-columns", `repeat(${weeks.length}, 1fr)`);

    const target = this.dailyWordTarget;
    const todayStr = dateString(today);

    // Rotate rows so today is always the last row (bottom-right)
    const todayGridRow = (today.getDay() + 6) % 7; // Sun→6, Mon→0, ..., Sat→5
    const startRow = (todayGridRow + 1) % 7;

    for (let r = 0; r < 7; r++) {
      const row = (startRow + r) % 7;
      for (let col = 0; col < weeks.length; col++) {
        const cell = weeks[col][row];
        if (!cell) continue;

        const el = cells.createDiv("tm-heatmap-cell");
        const hasNote = this.lastExistingDates.has(cell.date);
        const isToday = cell.date === todayStr;
        
        if (cell.count === 0) {
          el.addClass("tm-heatmap-empty");
        } else {
          const ratio = Math.min(cell.count / target, 1.5);
          if (ratio >= 1) el.addClass("tm-heatmap-l4");
          else if (ratio >= 0.75) el.addClass("tm-heatmap-l3");
          else if (ratio >= 0.5) el.addClass("tm-heatmap-l2");
          else if (ratio >= 0.25) el.addClass("tm-heatmap-l1");
          else el.addClass("tm-heatmap-l0");
        }

        if (isToday) el.addClass("tm-heatmap-today");

        el.addEventListener("mouseenter", (e) =>
          this.showTooltip(e.target as HTMLElement, cell.date, cell.count),
        );
        el.addEventListener("mouseleave", () => this.hideTooltip());
        // Dismiss tooltip on tap/click (fix: mobile stuck tooltip)
        el.addEventListener("click", () => this.hideTooltip());

        if (hasNote && this.onDayClick) {
          el.addClass("tm-heatmap-clickable");
          el.addEventListener("click", () => this.onDayClick?.(cell.date));
        }
      }
    }
  }

  private showTooltip(el: HTMLElement, date: string, count: number): void {
    this.hideTooltip();

    const tooltip = activeDocument.createElement("div");
    tooltip.addClass("tm-heatmap-tooltip");

    const pct = this.dailyWordTarget > 0 ? Math.round((count / this.dailyWordTarget) * 100) : 0;
    tooltip.createDiv({
      text: `${count}${t(" 字", " chars")}  ·  ${pct}%`,
    });
    tooltip.createDiv({ cls: "tm-heatmap-tooltip-date", text: date });
    activeDocument.body.appendChild(tooltip);

    const rect = el.getBoundingClientRect();
    const half = tooltip.offsetWidth / 2;
    const x = Math.max(
      half + 5,
      Math.min(rect.left + rect.width / 2, window.innerWidth - half - 5),
    );
    tooltip.style.setProperty("left", `${x}px`);
    tooltip.style.setProperty("top", `${rect.top - 38}px`);

    this.tooltipEl = tooltip;
  }

  private hideTooltip(): void {
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }
}
