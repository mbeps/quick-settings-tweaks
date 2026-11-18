import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";
import { PageIndicators } from "resource:///org/gnome/shell/ui/pageIndicators.js";
import {
	QuickMenuToggle,
	type QuickSettingsLayout,
	QuickToggle,
} from "resource:///org/gnome/shell/ui/quickSettings.js";
import { Slider } from "resource:///org/gnome/shell/ui/slider.js";
import Config from "../../config.js";
import Global from "../../global.js";
import type Maid from "../../libs/shared/maid.js";
import { FeatureBase, type SettingLoader } from "../../libs/shell/feature.js";
import { Drag } from "../../libs/shell/gesture.js";
import { QuickSettingsToggleTracker } from "../../libs/shell/quickSettingsUtils.js";
import { ToggleOrderItem } from "../../libs/types/toggleOrderItem.js";

const PAGE_TRANSITION_MS = 220;
const WHEEL_COOLDOWN_US = 120_000;
const FALLBACK_ROW_HEIGHT = 48;
const VERTICAL_OFFSET_PX = 28;
const HORIZONTAL_OFFSET_PX = 48;
const DRAG_COMMIT_THRESHOLD_PX = 40;
const MAX_DRAG_DAMPING_DISTANCE = 140;

type PaginatedToggle = QuickToggle | QuickMenuToggle;
type PaginationOrientation = "vertical" | "horizontal";

type ActiveMenuHost = {
	_activeMenu?: {
		isOpen: boolean;
		close: () => void;
	};
};

type LayoutMetaWithColSpan = Clutter.LayoutMeta & {
	columnSpan?: number;
};

type OverlayActor = Clutter.Actor & {
	allocate_available_size: (
		x: number,
		y: number,
		width: number,
		height: number,
	) => void;
};

type PaginatedLayoutInstance = QuickSettingsLayout & {
	_feature: TogglesLayoutFeature | null;
};

type PaginatedLayoutConstructor = {
	new (
		overlay: Clutter.Actor,
		params?: Partial<Clutter.LayoutManager.ConstructorProps> & {
			nColumns?: number;
		},
	): PaginatedLayoutInstance;
};

let cachedPaginatedLayoutClass: PaginatedLayoutConstructor | null = null;

/**
 * Lazily creates and caches a GObject-registered `QuickSettingsLayout` subclass so
 * Clutter's C vfunc dispatch invokes our `vfunc_get_preferred_height` and `vfunc_allocate`
 * overrides without re-registering a GTypeName on extension reload.
 */
function getPaginatedLayoutClass(
	BaseLayout: new (
		overlay: Clutter.Actor,
		params?: Record<string, unknown>,
	) => QuickSettingsLayout,
): PaginatedLayoutConstructor {
	if (cachedPaginatedLayoutClass) return cachedPaginatedLayoutClass;
	const SubClass = GObject.registerClass(
		{
			GTypeName: `${Config.baseGTypeName}PaginatedQuickSettingsLayout`,
		},
		class PaginatedQuickSettingsLayout extends BaseLayout {
			_feature: TogglesLayoutFeature | null;

			override _getRows(container: Clutter.Actor): Clutter.Actor[][] {
				if (!this._feature) return super._getRows(container);
				return this._feature.computeLayoutRows(this, container);
			}

			override vfunc_get_preferred_height(
				container: Clutter.Actor,
				forWidth: number,
			): [number, number] {
				const [minH, natH] = super.vfunc_get_preferred_height(
					container,
					forWidth,
				);
				if (!this._feature) return [minH, natH];
				return this._feature.adjustPreferredHeight(this, container, minH, natH);
			}

			override vfunc_allocate(
				container: Clutter.Actor,
				box: Clutter.ActorBox,
			): void {
				if (!this._feature?.shouldPaginateAllocate()) {
					this._feature?.onUnpaginatedAllocate();
					super.vfunc_allocate(container, box);
					return;
				}
				this._feature.allocatePaginatedGrid(this, container, box);
			}
		},
	);
	cachedPaginatedLayoutClass =
		SubClass as unknown as PaginatedLayoutConstructor;
	return cachedPaginatedLayoutClass;
}

// #region TogglesPaginationBar
/**
 * Pagination indicator bar with optional previous/next chevron buttons for Quick Settings toggles.
 */
class TogglesPaginationBar extends St.BoxLayout {
	_showPageButtons: boolean;
	_prevButton: St.Button;
	_pageIndicator: PageIndicators;
	_nextButton: St.Button;
	_lastSyncKey: string | null;

	constructor(options: TogglesPaginationBar.Options) {
		super(options as unknown as Partial<St.BoxLayout.ConstructorProps>);
	}

	_init(options: TogglesPaginationBar.Options): void {
		const isVertical = options.barOrientation === "vertical";
		super._init({
			style_class: `QSTWEAKS-toggles-pagination ${options.barOrientation}`,
			orientation: isVertical
				? Clutter.Orientation.VERTICAL
				: Clutter.Orientation.HORIZONTAL,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		});

		this._showPageButtons = options.showPageButtons;

		this._prevButton = new St.Button({
			style_class: "QSTWEAKS-toggles-page-button icon-button flat",
			child: new St.Icon({
				icon_name: isVertical ? "go-up-symbolic" : "go-previous-symbolic",
			}),
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this._prevButton.connect("clicked", () => this.emit("page-step", -1));

		this._pageIndicator = new PageIndicators(
			isVertical
				? Clutter.Orientation.VERTICAL
				: Clutter.Orientation.HORIZONTAL,
		);
		this._pageIndicator.connect(
			"page-activated",
			(_: PageIndicators, page: number) => this.emit("page-activated", page),
		);

		this._nextButton = new St.Button({
			style_class: "QSTWEAKS-toggles-page-button icon-button flat",
			child: new St.Icon({
				icon_name: isVertical ? "go-down-symbolic" : "go-next-symbolic",
			}),
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this._nextButton.connect("clicked", () => this.emit("page-step", 1));

		this.add_child(this._prevButton);
		this.add_child(this._pageIndicator);
		this.add_child(this._nextButton);
	}

	/**
	 * Synchronizes page indicator count, active dot, and button sensitivity.
	 *
	 * @param currentPage - Zero-based active page index
	 * @param nPages - Total number of pages
	 * @param wrapAround - Whether stepping wraps across page boundaries
	 */
	sync(currentPage: number, nPages: number, wrapAround: boolean): void {
		const syncKey = `${currentPage}:${nPages}:${wrapAround}`;
		if (this._lastSyncKey === syncKey) return;
		this._lastSyncKey = syncKey;

		this._pageIndicator.setNPages(nPages);
		this._pageIndicator.setCurrentPosition(currentPage);
		this.visible = nPages > 1;

		const showButtons = this._showPageButtons && nPages > 1;
		this._prevButton.visible = showButtons;
		this._nextButton.visible = showButtons;

		const canPrev = wrapAround || currentPage > 0;
		const canNext = wrapAround || currentPage < nPages - 1;
		this._prevButton.reactive = canPrev;
		this._prevButton.opacity = canPrev ? 255 : 96;
		this._nextButton.reactive = canNext;
		this._nextButton.opacity = canNext ? 255 : 96;
	}
}
GObject.registerClass(
	{
		GTypeName: `${Config.baseGTypeName}TogglesPaginationBar`,
		Signals: {
			"page-activated": { param_types: [GObject.TYPE_INT] },
			"page-step": { param_types: [GObject.TYPE_INT] },
		},
	},
	TogglesPaginationBar,
);
namespace TogglesPaginationBar {
	export type Options = {
		barOrientation: PaginationOrientation;
		showPageButtons: boolean;
	};
}
// #endregion TogglesPaginationBar

/**
 * Customizes visibility, ordering, and pagination of Quick Settings toggles in the grid.
 */
export class TogglesLayoutFeature extends FeatureBase {
	// #region settings
	/** Whether toggle layout customization is enabled. */
	enabled: boolean;
	/** Ordered list of toggle matching rules, including compiled title regexes. */
	order: ToggleOrderItem[];
	/** Fallback rule applied to toggles not explicitly matched in `order`. */
	unordered: ToggleOrderItem;

	/** Whether toggle pagination is enabled. */
	paginationEnabled: boolean;
	/** Maximum number of toggle tiles per page (always an even integer >= 2). */
	maxPerPage: number;
	/** Pagination scroll and indicator orientation. */
	orientation: PaginationOrientation;
	/** Whether previous/next chevron buttons are shown around the dots. */
	showPageButtons: boolean;
	/** Whether page navigation wraps around from first to last and vice versa. */
	wrapAround: boolean;
	/** Multiplier for touchpad smooth scroll deltas; negative inverts direction. */
	smoothScrollSpeed: number;

	/**
	 * Loads toggle layout and pagination settings.
	 *
	 * @param loader - Setting loader bound to the extension schema
	 */
	override loadSettings(loader: SettingLoader): void {
		this.enabled = loader.loadBoolean("toggles-layout-enabled");
		this.order = loader.loadValue("toggles-layout-order");
		for (const orderItem of this.order) {
			if (orderItem.titleRegex) {
				orderItem.cachedTitleRegex = new RegExp(orderItem.titleRegex);
			}
			if (orderItem.nonOrdered) {
				this.unordered = orderItem;
			}
		}

		this.paginationEnabled = loader.loadBoolean("toggles-pagination-enabled");
		const rawMaxPerPage = loader.loadInt("toggles-pagination-max-per-page");
		this.maxPerPage = Math.max(2, Math.floor(rawMaxPerPage / 2) * 2);
		this.orientation = loader.loadString(
			"toggles-pagination-orientation",
		) as PaginationOrientation;
		this.showPageButtons = loader.loadBoolean(
			"toggles-pagination-show-page-buttons",
		);
		this.wrapAround = loader.loadBoolean("toggles-pagination-wrap-around");
		this.smoothScrollSpeed = loader.loadInt(
			"toggles-pagination-smooth-scroll-speed",
		);
	}
	// #endregion settings

	/** Tracker monitoring `Global.QuickSettingsGrid` toggle additions and visibility changes. */
	tracker: QuickSettingsToggleTracker | null = null;
	private paginationBar: TogglesPaginationBar | null = null;
	private pages: PaginatedToggle[][] = [];
	private inactiveToggles: PaginatedToggle[] = [];
	private toggleRows = new WeakSet<Clutter.Actor[]>();
	private currentPage = 0;
	private toggleBlockX1 = 0;
	private toggleBlockClipY1 = 0;
	private toggleBlockWidth = 0;
	private toggleBlockY1 = 0;
	private toggleBlockY2 = 0;
	private clipListeners = new Map<PaginatedToggle, [number, number, number]>();

	private lastWheelTimeUs = 0;
	private pressCoords: [number, number] | null = null;
	private swipeActive = false;
	private pressedToggle: PaginatedToggle | null = null;
	private activePressIsTouch = false;
	private activeTouchSequence: Clutter.EventSequence | null = null;
	private disabledActions: Clutter.Action[] = [];
	private restoreActionsIdleId: number | null = null;
	private smoothScrollActive = false;
	private smoothScrollAccum = 0;

	/**
	 * Hides a newly created toggle if its matching order rule specifies `hide`.
	 */
	onToggleCreated(maid: Maid, toggle: PaginatedToggle): void {
		if (!this.enabled) return;
		const rule: ToggleOrderItem =
			this.order.find((item) => ToggleOrderItem.toggleMatch(item, toggle)) ??
			this.unordered;
		if (rule?.hide) maid.hideJob(toggle);
	}

	/**
	 * Reorders toggles when ordering is enabled and triggers grid relayout when paginated.
	 */
	onUpdate(): void {
		if (this.enabled) {
			this.reorderToggles();
		}
		if (this.paginationEnabled) {
			const layout = Global.QuickSettingsGrid
				.layout_manager as QuickSettingsLayout;
			this.computePages(layout, Global.QuickSettingsGrid);
			Global.QuickSettingsGrid.queue_relayout();
		}
	}

	private reorderToggles(): void {
		const children = Global.QuickSettingsGrid.get_children();
		const head: PaginatedToggle[] = [];
		const middle: PaginatedToggle[] = children.filter(
			(child): child is PaginatedToggle =>
				(child instanceof QuickMenuToggle || child instanceof QuickToggle) &&
				child.constructor.name !== "BackgroundAppsToggle",
		);
		const tail: PaginatedToggle[] = [];
		let overNonOrdered = false;
		for (const item of this.order) {
			if (item.nonOrdered) {
				overNonOrdered = true;
				continue;
			}
			const middleIndex = middle.findIndex((toggle) =>
				ToggleOrderItem.toggleMatch(item, toggle),
			);
			if (middleIndex === -1) continue;
			const toggle = middle[middleIndex];
			middle.splice(middleIndex, 1);
			(overNonOrdered ? tail : head).push(toggle);
		}
		let last: PaginatedToggle | null = null;
		for (const item of [head, middle, tail].flat()) {
			if (last) Global.QuickSettingsGrid.set_child_above_sibling(item, last);
			last = item;
		}
	}

	/**
	 * Starts the toggle tracker and pagination hooks when enabled.
	 */
	override onLoad(): void {
		if (!this.enabled && !this.paginationEnabled) return;

		if (this.paginationEnabled) {
			this.setupPagination();
		}

		this.tracker = new QuickSettingsToggleTracker();
		this.tracker.onToggleCreated = this.onToggleCreated.bind(this);
		this.tracker.onUpdate = this.onUpdate.bind(this);
		this.tracker.load();
	}

	/**
	 * Unloads the toggle tracker and restores all paginated toggles.
	 */
	override onUnload(): void {
		if (this.tracker) {
			this.tracker.unload();
			this.tracker = null;
		}
		this.resetDragState();
		this.toggleBlockX1 = 0;
		this.toggleBlockClipY1 = 0;
		this.toggleBlockWidth = 0;
		this.toggleBlockY1 = 0;
		this.toggleBlockY2 = 0;
		this.clearToggleClips();
		if (Global.QuickSettingsGrid) {
			for (const child of Global.QuickSettingsGrid.get_children()) {
				if (this.isToggleActor(child)) {
					child.remove_all_transitions();
					child.opacity = 255;
					child.reactive = true;
					child.translation_x = 0;
					child.translation_y = 0;
				}
			}
		}
		this.paginationBar = null;
		this.pages = [];
		this.inactiveToggles = [];
		this.currentPage = 0;
	}

	private isToggleActor(child: Clutter.Actor): child is PaginatedToggle {
		return (
			(child instanceof QuickToggle || child instanceof QuickMenuToggle) &&
			child.constructor.name !== "BackgroundAppsToggle"
		);
	}

	private isPaginatedToggle(
		layout: QuickSettingsLayout,
		container: Clutter.Actor,
		child: Clutter.Actor,
	): child is PaginatedToggle {
		return (
			this.isToggleActor(child) && layout._getColSpan(container, child) === 1
		);
	}

	private computePages(
		layout: QuickSettingsLayout,
		container: Clutter.Actor,
	): void {
		const visibleToggles: PaginatedToggle[] = [];
		for (const child of container.get_children()) {
			if (child.visible && this.isPaginatedToggle(layout, container, child)) {
				visibleToggles.push(child);
			}
		}

		const pages: PaginatedToggle[][] = [];
		for (let i = 0; i < visibleToggles.length; i += this.maxPerPage) {
			pages.push(visibleToggles.slice(i, i + this.maxPerPage));
		}

		this.pages = pages;
		this.currentPage = Math.max(
			0,
			Math.min(this.currentPage, Math.max(0, pages.length - 1)),
		);
		this.inactiveToggles = [];
		for (let i = 0; i < pages.length; i++) {
			if (i !== this.currentPage) {
				this.inactiveToggles.push(...pages[i]);
			}
		}

		this.paginationBar?.sync(this.currentPage, pages.length, this.wrapAround);
	}

	private setupPagination(): void {
		const bar = new TogglesPaginationBar({
			barOrientation: this.orientation,
			showPageButtons: this.showPageButtons,
		});
		this.paginationBar = bar;
		Global.QuickSettingsGrid.add_child(bar);
		this.maid.destroyJob(bar, 10);

		this.maid.connectJob(
			bar,
			"page-activated",
			(_bar: TogglesPaginationBar, page: number) => {
				this.setPage(page);
			},
		);
		this.maid.connectJob(
			bar,
			"page-step",
			(_bar: TogglesPaginationBar, delta: number) => {
				this.seekPage(delta);
			},
		);

		this.installPaginatedLayoutManager();

		this.maid.connectJob(
			Global.QuickSettingsMenu._boxPointer,
			"captured-event",
			this.onCapturedEvent.bind(this),
		);
		this.maid.connectJob(Global.QuickSettingsMenu, "menu-closed", () => {
			this.resetDragState();
		});
		this.maid.functionJob(() => {
			Global.QuickSettingsGrid?.queue_relayout();
		}, -10);
	}

	private installPaginatedLayoutManager(): void {
		const grid = Global.QuickSettingsGrid;
		const origLayout = grid.layout_manager as QuickSettingsLayout;
		const BaseClass = origLayout.constructor as new (
			overlay: Clutter.Actor,
			params?: Record<string, unknown>,
		) => QuickSettingsLayout;

		const savedColSpans = new Map<Clutter.Actor, number>();
		for (const child of grid.get_children()) {
			if (child === this.paginationBar) continue;
			const meta = origLayout.get_child_meta(
				grid,
				child,
			) as LayoutMetaWithColSpan | null;
			if (meta?.columnSpan && meta.columnSpan !== 1) {
				savedColSpans.set(child, meta.columnSpan);
			}
		}

		const PaginatedClass = getPaginatedLayoutClass(BaseClass);
		const newLayout = new PaginatedClass(origLayout._overlay, {
			nColumns: origLayout.nColumns,
		});
		newLayout.rowSpacing = origLayout.rowSpacing;
		newLayout.columnSpacing = origLayout.columnSpacing;
		newLayout._feature = this;

		grid.layout_manager = newLayout;
		for (const [child, colSpan] of savedColSpans) {
			newLayout.child_set_property(grid, child, "column-span", colSpan);
		}

		this.computePages(newLayout, grid);
		grid.queue_relayout();

		this.maid.functionJob(() => {
			newLayout._feature = null;
			if (!Global.QuickSettingsGrid) return;
			const currentGrid = Global.QuickSettingsGrid;
			const currentColSpans = new Map<Clutter.Actor, number>();
			for (const child of currentGrid.get_children()) {
				if (child === this.paginationBar) continue;
				const meta = newLayout.get_child_meta(
					currentGrid,
					child,
				) as LayoutMetaWithColSpan | null;
				if (meta?.columnSpan && meta.columnSpan !== 1) {
					currentColSpans.set(child, meta.columnSpan);
				}
			}
			currentGrid.layout_manager = origLayout;
			for (const [child, colSpan] of currentColSpans) {
				origLayout.child_set_property(
					currentGrid,
					child,
					"column-span",
					colSpan,
				);
			}
		}, 5);
	}

	/**
	 * Computes layout rows for `QuickSettingsGrid`, filtering out off-page toggles and the
	 * floating pagination bar while preserving upstream `_overlay` exclusion.
	 */
	computeLayoutRows(
		layout: QuickSettingsLayout,
		container: Clutter.Actor,
	): Clutter.Actor[][] {
		this.computePages(layout, container);
		const activeSet = new Set(this.pages[this.currentPage] ?? []);
		const rows: Clutter.Actor[][] = [];
		let currentRow: Clutter.Actor[] = [];
		let currentCols = 0;
		let rowHasToggle = false;

		const flushRow = () => {
			if (currentRow.length === 0) return;
			if (rowHasToggle) this.toggleRows.add(currentRow);
			rows.push(currentRow);
			currentRow = [];
			currentCols = 0;
			rowHasToggle = false;
		};

		for (const child of container.get_children()) {
			if (
				child === layout._overlay ||
				child === this.paginationBar ||
				!child.visible
			) {
				continue;
			}
			if (this.isPaginatedToggle(layout, container, child)) {
				if (!activeSet.has(child)) continue;
			}

			const colSpan = layout._getColSpan(container, child);
			if (currentCols + colSpan > layout.nColumns) {
				flushRow();
			}
			if (this.isPaginatedToggle(layout, container, child)) {
				rowHasToggle = true;
			}
			currentRow.push(child);
			currentCols += colSpan;
		}
		flushRow();
		return rows;
	}

	/**
	 * Adjusts preferred height to keep full-page height on partial last pages and reserve
	 * space for the horizontal pagination strip.
	 */
	adjustPreferredHeight(
		layout: QuickSettingsLayout,
		container: Clutter.Actor,
		minHeight: number,
		natHeight: number,
	): [number, number] {
		if (this.pages.length <= 1) return [minHeight, natHeight];

		const rows = layout._getRows(container);
		const activeToggleRows = rows.filter((row) => this.toggleRows.has(row));
		const rowsPerPage = this.maxPerPage / 2;
		let extraHeight = 0;

		if (activeToggleRows.length < rowsPerPage) {
			const rowHeight = this.getStandardRowHeight(layout, activeToggleRows);
			const missingRows = rowsPerPage - activeToggleRows.length;
			extraHeight += missingRows * (rowHeight + layout.rowSpacing);
		}

		if (this.orientation === "horizontal" && this.paginationBar) {
			const [, barNatH] = this.paginationBar.get_preferred_height(-1);
			extraHeight += barNatH + layout.rowSpacing;
		}

		return [minHeight + extraHeight, natHeight + extraHeight];
	}

	/**
	 * Returns whether custom paginated allocation should run instead of upstream allocation.
	 */
	shouldPaginateAllocate(): boolean {
		return this.pages.length > 1;
	}

	/**
	 * Resets region bounds and restores toggle visibility/reactivity when only one page exists.
	 */
	onUnpaginatedAllocate(): void {
		this.toggleBlockX1 = 0;
		this.toggleBlockClipY1 = 0;
		this.toggleBlockWidth = 0;
		this.toggleBlockY1 = 0;
		this.toggleBlockY2 = 0;
		this.clearToggleClips();
		for (const toggle of this.pages[0] ?? []) {
			toggle.reactive = true;
			if (toggle.get_transition("opacity") === null) {
				toggle.opacity = 255;
			}
		}
	}

	private getStandardRowHeight(
		layout: QuickSettingsLayout,
		activeToggleRows: Clutter.Actor[][],
	): number {
		if (activeToggleRows.length > 0) {
			const [, nat] = layout._getRowHeight(activeToggleRows[0]);
			return nat;
		}
		const scaleFactor = St.ThemeContext.get_for_stage(
			global.stage,
		).scale_factor;
		return FALLBACK_ROW_HEIGHT * scaleFactor;
	}

	/**
	 * Allocates active-page rows, zeroes off-page toggles, reserves partial-page height,
	 * and positions `TogglesPaginationBar`.
	 */
	allocatePaginatedGrid(
		layout: QuickSettingsLayout,
		container: Clutter.Actor,
		box: Clutter.ActorBox,
	): void {
		const rows = layout._getRows(container);
		const zeroBox = new Clutter.ActorBox({ x1: 0, y1: 0, x2: 0, y2: 0 });
		for (const toggle of this.inactiveToggles) {
			toggle.remove_all_transitions();
			toggle.translation_x = 0;
			toggle.translation_y = 0;
			toggle.remove_clip();
			toggle.allocate(zeroBox);
			toggle.opacity = 0;
			toggle.reactive = false;
		}
		for (const toggle of this.pages[this.currentPage] ?? []) {
			toggle.reactive = true;
			if (
				!this.swipeActive &&
				!this.smoothScrollActive &&
				toggle.get_transition("opacity") === null
			) {
				toggle.opacity = 255;
			}
		}

		const [, overlayHeight] = layout._overlay.get_preferred_height(
			box.get_width(),
		);
		(layout._overlay as OverlayActor).allocate_available_size(
			0,
			0,
			box.get_width(),
			overlayHeight,
		);

		const availWidth =
			box.get_width() - (layout.nColumns - 1) * layout.columnSpacing;
		const childWidth = Math.floor(availWidth / layout.nColumns);
		const isRtl = container.get_text_direction() === Clutter.TextDirection.RTL;
		const activeToggleRows = rows.filter((row) => this.toggleRows.has(row));
		const lastToggleRow = activeToggleRows[activeToggleRows.length - 1] ?? null;
		const standardRowH = this.getStandardRowHeight(layout, activeToggleRows);
		const rowsPerPage = this.maxPerPage / 2;

		const childBox = new Clutter.ActorBox();
		let y = box.y1;
		let toggleY1 = box.y1;
		let toggleY2 = box.y1;
		let barY = box.y1;

		for (const row of rows) {
			const [, rowNat] = layout._getRowHeight(row);
			if (this.toggleRows.has(row) && row === activeToggleRows[0]) {
				toggleY1 = y;
			}

			let lineIndex = 0;
			for (const child of row) {
				const colSpan = layout._getColSpan(container, child);
				const width =
					childWidth * colSpan + layout.columnSpacing * (colSpan - 1);
				let x = box.x1 + lineIndex * (childWidth + layout.columnSpacing);
				if (isRtl) x = box.x2 - width - x;

				childBox.set_origin(x, y);
				childBox.set_size(width, rowNat);
				child.allocate(childBox);

				lineIndex = (lineIndex + colSpan) % layout.nColumns;
			}

			const hasOpenSubmenu = row.some(
				(c) =>
					(c as Clutter.Actor & { menu?: { actor: Clutter.Actor } }).menu?.actor
						.visible,
			);
			const rowBottom = y + rowNat + (hasOpenSubmenu ? overlayHeight : 0);

			if (row === lastToggleRow) {
				const minBlockBottom =
					toggleY1 +
					rowsPerPage * standardRowH +
					Math.max(0, rowsPerPage - 1) * layout.rowSpacing;
				toggleY2 = Math.max(rowBottom, minBlockBottom);
				y = toggleY2 + layout.rowSpacing;
				if (this.orientation === "horizontal" && this.paginationBar) {
					const [, barNatH] = this.paginationBar.get_preferred_height(-1);
					barY = y;
					y += barNatH + layout.rowSpacing;
				}
			} else {
				y = rowBottom + layout.rowSpacing;
			}
		}

		this.toggleBlockX1 = box.x1;
		this.toggleBlockClipY1 = toggleY1;
		this.toggleBlockWidth = box.get_width();
		this.toggleBlockY1 = toggleY1 - box.y1;
		this.toggleBlockY2 = toggleY2 - box.y1;
		for (const toggle of this.pages[this.currentPage] ?? []) {
			this.ensureClipListeners(toggle);
			this.updateToggleClip(toggle);
		}
		this.allocatePaginationBar(
			box,
			box.get_width(),
			isRtl,
			toggleY1,
			toggleY2,
			barY,
		);
	}

	private allocatePaginationBar(
		box: Clutter.ActorBox,
		availWidth: number,
		isRtl: boolean,
		toggleY1: number,
		toggleY2: number,
		barY: number,
	): void {
		if (!this.paginationBar?.visible) return;
		const [, barNatW] = this.paginationBar.get_preferred_width(-1);
		const [, barNatH] = this.paginationBar.get_preferred_height(-1);

		if (this.orientation === "horizontal") {
			const barX = box.x1 + Math.max(0, (availWidth - barNatW) / 2);
			this.paginationBar.allocate(
				new Clutter.ActorBox({
					x1: barX,
					y1: barY,
					x2: barX + barNatW,
					y2: barY + barNatH,
				}),
			);
			return;
		}

		const boxPadding = Global.QuickSettingsBox.get_theme_node().get_padding(
			isRtl ? St.Side.LEFT : St.Side.RIGHT,
		);
		const gutterOffset = Math.max(2, (boxPadding - barNatW) / 2);
		const barX = isRtl
			? box.x1 - barNatW - gutterOffset
			: box.x2 + gutterOffset;
		const centeredY =
			toggleY1 + Math.max(0, (toggleY2 - toggleY1 - barNatH) / 2);
		this.paginationBar.allocate(
			new Clutter.ActorBox({
				x1: barX,
				y1: centeredY,
				x2: barX + barNatW,
				y2: centeredY + barNatH,
			}),
		);
	}

	private closeActiveSubmenu(): void {
		const activeMenu = (Global.QuickSettingsMenu as unknown as ActiveMenuHost)
			._activeMenu;
		if (activeMenu?.isOpen) {
			activeMenu.close();
		}
	}

	private setPage(targetPage: number, animate = true): void {
		const nPages = this.pages.length;
		if (nPages <= 1) return;
		const clamped = Math.max(0, Math.min(targetPage, nPages - 1));
		if (clamped === this.currentPage) {
			this.snapActiveToggles();
			return;
		}

		this.closeActiveSubmenu();
		const direction = clamped > this.currentPage ? 1 : -1;
		this.currentPage = clamped;
		this.paginationBar?.sync(this.currentPage, nPages, this.wrapAround);
		Global.QuickSettingsGrid.queue_relayout();

		if (!animate) {
			this.snapActiveToggles();
			return;
		}

		const incoming = this.pages[this.currentPage] ?? [];
		const offsetPx =
			this.orientation === "vertical"
				? direction * VERTICAL_OFFSET_PX
				: direction * HORIZONTAL_OFFSET_PX;

		for (const toggle of incoming) {
			this.ensureClipListeners(toggle);
			toggle.remove_all_transitions();
			toggle.opacity = 0;
			if (this.orientation === "vertical") {
				toggle.translation_y = offsetPx;
				toggle.translation_x = 0;
			} else {
				toggle.translation_x = offsetPx;
				toggle.translation_y = 0;
			}
			this.updateToggleClip(toggle);
			toggle.ease({
				opacity: 255,
				translationX: 0,
				translationY: 0,
				duration: PAGE_TRANSITION_MS,
				mode: Clutter.AnimationMode.EASE_OUT_EXPO,
			});
		}
	}

	private seekPage(delta: number): void {
		const nPages = this.pages.length;
		if (nPages <= 1) return;
		let target = this.currentPage + delta;
		if (this.wrapAround) {
			target = ((target % nPages) + nPages) % nPages;
		} else {
			target = Math.max(0, Math.min(target, nPages - 1));
		}
		this.setPage(target, true);
	}

	private snapActiveToggles(): void {
		for (const toggle of this.pages[this.currentPage] ?? []) {
			toggle.ease({
				opacity: 255,
				translationX: 0,
				translationY: 0,
				duration: PAGE_TRANSITION_MS,
				mode: Clutter.AnimationMode.EASE_OUT_EXPO,
			});
		}
	}

	private updateDragOffset(offsetPx: number): void {
		const nPages = this.pages.length;
		if (nPages <= 1) return;

		const atStartEdge =
			!this.wrapAround && this.currentPage === 0 && offsetPx > 0;
		const atEndEdge =
			!this.wrapAround && this.currentPage === nPages - 1 && offsetPx < 0;
		const edgeFactor = atStartEdge || atEndEdge ? 0.35 : 1;

		const sign = offsetPx < 0 ? -1 : 1;
		const abs = Math.abs(offsetPx) * edgeFactor;
		const damped =
			sign *
			MAX_DRAG_DAMPING_DISTANCE *
			(1 - Math.exp(-abs / MAX_DRAG_DAMPING_DISTANCE));
		const ratio = Math.min(1, Math.abs(damped) / MAX_DRAG_DAMPING_DISTANCE);
		const opacity = Math.round(255 - (255 - 110) * ratio);

		for (const toggle of this.pages[this.currentPage] ?? []) {
			this.ensureClipListeners(toggle);
			toggle.remove_all_transitions();
			toggle.opacity = opacity;
			if (this.orientation === "vertical") {
				toggle.translation_y = damped;
				toggle.translation_x = 0;
			} else {
				toggle.translation_x = damped;
				toggle.translation_y = 0;
			}
			this.updateToggleClip(toggle);
		}
	}

	private updateToggleClip(toggle: PaginatedToggle): void {
		if (
			this.toggleBlockWidth <= 0 ||
			this.toggleBlockY2 <= this.toggleBlockY1 ||
			(toggle.translation_x === 0 && toggle.translation_y === 0)
		) {
			toggle.remove_clip();
			return;
		}
		const alloc = toggle.get_allocation_box();
		const xoff = this.toggleBlockX1 - alloc.x1 - toggle.translation_x;
		const yoff = this.toggleBlockClipY1 - alloc.y1 - toggle.translation_y;
		toggle.set_clip(
			xoff,
			yoff,
			this.toggleBlockWidth,
			this.toggleBlockY2 - this.toggleBlockY1,
		);
	}

	private ensureClipListeners(toggle: PaginatedToggle): void {
		if (this.clipListeners.has(toggle)) return;
		const txId = toggle.connect("notify::translation-x", () => {
			this.updateToggleClip(toggle);
		});
		const tyId = toggle.connect("notify::translation-y", () => {
			this.updateToggleClip(toggle);
		});
		const destroyId = toggle.connect("destroy", () => {
			this.disconnectToggleClipListeners(toggle);
		});
		this.clipListeners.set(toggle, [txId, tyId, destroyId]);
	}

	private disconnectToggleClipListeners(toggle: PaginatedToggle): void {
		const ids = this.clipListeners.get(toggle);
		if (!ids) return;
		this.clipListeners.delete(toggle);
		for (const id of ids) {
			toggle.disconnect(id);
		}
	}

	private clearToggleClips(): void {
		for (const [toggle, ids] of this.clipListeners) {
			for (const id of ids) {
				toggle.disconnect(id);
			}
			toggle.remove_clip();
		}
		this.clipListeners.clear();
		if (Global.QuickSettingsGrid) {
			for (const child of Global.QuickSettingsGrid.get_children()) {
				if (this.isToggleActor(child)) {
					child.remove_clip();
				}
			}
		}
	}

	private finalizeDragOffset(offsetPx: number): void {
		if (Math.abs(offsetPx) >= DRAG_COMMIT_THRESHOLD_PX) {
			// Dragging up/left (negative offset) advances to the next page
			const delta = offsetPx < 0 ? 1 : -1;
			const nPages = this.pages.length;
			const canMove =
				this.wrapAround ||
				(delta > 0 && this.currentPage < nPages - 1) ||
				(delta < 0 && this.currentPage > 0);
			if (canMove) {
				this.seekPage(delta);
				return;
			}
		}
		this.snapActiveToggles();
	}

	private clearPressState(): void {
		this.pressCoords = null;
		this.swipeActive = false;
		this.pressedToggle = null;
		this.activePressIsTouch = false;
		this.activeTouchSequence = null;
	}

	private restoreDisabledActionsNow(): void {
		if (this.restoreActionsIdleId !== null) {
			GLib.source_remove(this.restoreActionsIdleId);
			this.restoreActionsIdleId = null;
		}
		for (const action of this.disabledActions) {
			action.enabled = true;
		}
		this.disabledActions = [];
	}

	private scheduleRestoreDisabledActions(): void {
		if (
			this.disabledActions.length === 0 ||
			this.restoreActionsIdleId !== null
		) {
			return;
		}
		this.restoreActionsIdleId = GLib.idle_add(
			GLib.PRIORITY_DEFAULT_IDLE,
			() => {
				this.restoreActionsIdleId = null;
				this.restoreDisabledActionsNow();
				return GLib.SOURCE_REMOVE;
			},
		);
	}

	private resetDragState(): void {
		this.clearPressState();
		this.smoothScrollActive = false;
		this.smoothScrollAccum = 0;
		this.restoreDisabledActionsNow();

		for (const toggle of this.pages[this.currentPage] ?? []) {
			toggle.remove_all_transitions();
			toggle.opacity = 255;
			toggle.translation_x = 0;
			toggle.translation_y = 0;
			toggle.remove_clip();
		}
	}

	private getToggleRegionStageBounds(): {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	} | null {
		if (this.toggleBlockY2 <= this.toggleBlockY1) return null;
		const [gx, gy] = Global.QuickSettingsGrid.get_transformed_position();
		return {
			x1: gx,
			y1: gy + this.toggleBlockY1,
			x2: gx + Global.QuickSettingsGrid.width,
			y2: gy + this.toggleBlockY2,
		};
	}

	private isPointInToggleRegion(x: number, y: number): boolean {
		const bounds = this.getToggleRegionStageBounds();
		if (!bounds) return false;
		return x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2;
	}

	private hasBlockedAncestor(x: number, y: number): boolean {
		let actor: Clutter.Actor | null = global.stage.get_actor_at_pos(
			Clutter.PickMode.REACTIVE,
			x,
			y,
		);
		while (actor && actor !== Global.QuickSettingsBox) {
			if (
				actor instanceof Slider ||
				actor instanceof St.ScrollView ||
				actor === this.paginationBar
			) {
				return true;
			}
			actor = actor.get_parent();
		}
		return false;
	}

	private findToggleAtPos(x: number, y: number): PaginatedToggle | null {
		let actor: Clutter.Actor | null = global.stage.get_actor_at_pos(
			Clutter.PickMode.REACTIVE,
			x,
			y,
		);
		while (actor && actor !== Global.QuickSettingsGrid) {
			if (this.isToggleActor(actor)) return actor;
			actor = actor.get_parent();
		}
		return null;
	}

	private onCapturedEvent(
		_actor: Clutter.Actor,
		event: Clutter.Event,
	): boolean {
		const activeMenu = (Global.QuickSettingsMenu as unknown as ActiveMenuHost)
			._activeMenu;
		if (this.pages.length <= 1 || activeMenu?.isOpen) {
			if (this.pressCoords !== null) {
				this.cancelDrag();
			}
			return Clutter.EVENT_PROPAGATE;
		}

		const type = event.type();
		const [x, y] = event.get_coords();

		if (type === Clutter.EventType.SCROLL) {
			if (!this.isPointInToggleRegion(x, y) || this.hasBlockedAncestor(x, y)) {
				return Clutter.EVENT_PROPAGATE;
			}
			return this.handleScrollEvent(event);
		}

		if (
			type === Clutter.EventType.BUTTON_PRESS ||
			type === Clutter.EventType.TOUCH_BEGIN
		) {
			if (
				type === Clutter.EventType.BUTTON_PRESS &&
				(event.is_pointer_emulated() ||
					event.get_button() !== Clutter.BUTTON_PRIMARY)
			) {
				return Clutter.EVENT_PROPAGATE;
			}
			if (
				this.pressCoords !== null ||
				!this.isPointInToggleRegion(x, y) ||
				this.hasBlockedAncestor(x, y)
			) {
				return Clutter.EVENT_PROPAGATE;
			}
			if (this.restoreActionsIdleId !== null) {
				this.restoreDisabledActionsNow();
			}
			this.pressCoords = [x, y];
			this.swipeActive = false;
			this.pressedToggle = this.findToggleAtPos(x, y);
			this.activePressIsTouch = type === Clutter.EventType.TOUCH_BEGIN;
			this.activeTouchSequence = this.activePressIsTouch
				? event.get_event_sequence()
				: null;
			// Never return EVENT_STOP on press/touch_begin so St.Button's ClickGesture stays intact
			return Clutter.EVENT_PROPAGATE;
		}

		if (this.pressCoords === null) {
			return Clutter.EVENT_PROPAGATE;
		}

		if (type === Clutter.EventType.MOTION) {
			if (this.activePressIsTouch || event.is_pointer_emulated()) {
				return Clutter.EVENT_PROPAGATE;
			}
			return this.handleDragMotion(x, y);
		}

		if (type === Clutter.EventType.BUTTON_RELEASE) {
			if (
				this.activePressIsTouch ||
				event.is_pointer_emulated() ||
				event.get_button() !== Clutter.BUTTON_PRIMARY
			) {
				return Clutter.EVENT_PROPAGATE;
			}
			return this.finishDrag(x, y, false);
		}

		if (
			type === Clutter.EventType.TOUCH_UPDATE ||
			type === Clutter.EventType.TOUCH_END ||
			type === Clutter.EventType.TOUCH_CANCEL
		) {
			if (!this.activePressIsTouch) return Clutter.EVENT_PROPAGATE;
			if (
				this.activeTouchSequence &&
				event.get_event_sequence()?.get_slot() !==
					this.activeTouchSequence.get_slot()
			) {
				return Clutter.EVENT_PROPAGATE;
			}
			if (type === Clutter.EventType.TOUCH_UPDATE) {
				return this.handleDragMotion(x, y);
			}
			return this.finishDrag(x, y, type === Clutter.EventType.TOUCH_CANCEL);
		}

		return Clutter.EVENT_PROPAGATE;
	}

	private handleScrollEvent(event: Clutter.Event): boolean {
		if (event.is_pointer_emulated()) return Clutter.EVENT_PROPAGATE;
		const direction = event.get_scroll_direction();

		if (
			direction === Clutter.ScrollDirection.SMOOTH &&
			event.get_scroll_source() !== Clutter.ScrollSource.WHEEL
		) {
			const [dx, dy] = event.get_scroll_delta();
			const finish = event.get_scroll_finish_flags();
			const primary =
				this.orientation === "vertical"
					? dy
					: Math.abs(dy) > Math.abs(dx) * 2
						? dy
						: dx;

			const shouldStop =
				finish !== Clutter.ScrollFinishFlags.NONE || (dx === 0 && dy === 0);

			if (!this.smoothScrollActive) {
				if (shouldStop) return Clutter.EVENT_PROPAGATE;
				this.smoothScrollActive = true;
				this.smoothScrollAccum = 0;
			}

			this.smoothScrollAccum += -primary * this.smoothScrollSpeed;
			this.updateDragOffset(this.smoothScrollAccum);

			if (shouldStop) {
				const total = this.smoothScrollAccum;
				this.smoothScrollActive = false;
				this.smoothScrollAccum = 0;
				this.finalizeDragOffset(total);
			}
			return Clutter.EVENT_STOP;
		}

		let step = 0;
		if (
			direction === Clutter.ScrollDirection.UP ||
			direction === Clutter.ScrollDirection.LEFT
		) {
			step = -1;
		} else if (
			direction === Clutter.ScrollDirection.DOWN ||
			direction === Clutter.ScrollDirection.RIGHT
		) {
			step = 1;
		}
		if (step === 0) return Clutter.EVENT_PROPAGATE;

		const now = GLib.get_monotonic_time();
		if (now - this.lastWheelTimeUs < WHEEL_COOLDOWN_US) {
			return Clutter.EVENT_STOP;
		}
		this.lastWheelTimeUs = now;
		this.seekPage(step);
		return Clutter.EVENT_STOP;
	}

	private handleDragMotion(x: number, y: number): boolean {
		if (!this.pressCoords) return Clutter.EVENT_PROPAGATE;
		const [sx, sy] = this.pressCoords;
		const dx = x - sx;
		const dy = y - sy;
		const primaryDelta = this.orientation === "vertical" ? dy : dx;
		const crossDelta = this.orientation === "vertical" ? dx : dy;

		if (!this.swipeActive) {
			if (
				Math.abs(primaryDelta) <= Drag.DragMinPixel ||
				Math.abs(primaryDelta) < Math.abs(crossDelta)
			) {
				return Clutter.EVENT_PROPAGATE;
			}
			this.swipeActive = true;
			if (this.pressedToggle) {
				this.pressedToggle.remove_style_pseudo_class("active");
				this.pressedToggle.remove_style_pseudo_class("focus");
				for (const action of this.pressedToggle.get_actions()) {
					if (action.enabled) {
						action.enabled = false;
						this.disabledActions.push(action);
					}
				}
			}
		}

		this.updateDragOffset(primaryDelta);
		return Clutter.EVENT_STOP;
	}

	private finishDrag(x: number, y: number, cancelled: boolean): boolean {
		if (!this.pressCoords) return Clutter.EVENT_PROPAGATE;
		const wasSwipe = this.swipeActive;
		const [sx, sy] = this.pressCoords;
		const offset = this.orientation === "vertical" ? y - sy : x - sx;

		this.clearPressState();
		this.scheduleRestoreDisabledActions();

		if (!wasSwipe) return Clutter.EVENT_PROPAGATE;

		if (cancelled) {
			this.snapActiveToggles();
		} else {
			this.finalizeDragOffset(offset);
		}
		return Clutter.EVENT_STOP;
	}

	private cancelDrag(): void {
		const wasSwipe = this.swipeActive;
		this.clearPressState();
		this.scheduleRestoreDisabledActions();
		if (wasSwipe) {
			this.snapActiveToggles();
		}
	}
}
