import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Graphene from "gi://Graphene";
import Meta from "gi://Meta";
import St from "gi://St";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import * as ShellConfig from "resource:///org/gnome/shell/misc/config.js";
import { PopupAnimation } from "resource:///org/gnome/shell/ui/boxpointer.js";
import type { QuickSettingsMenu } from "resource:///org/gnome/shell/ui/quickSettings.js";
import Global from "../global.js";
import type Maid from "../libs/shared/maid.js";
import { FeatureBase, type SettingLoader } from "../libs/shell/feature.js";
import { QuickSettingsMenuTracker } from "../libs/shell/quickSettingsUtils.js";

const SHELL_MAJOR = Number.parseInt(ShellConfig.PACKAGE_VERSION, 10);
const CLOSE_NO_ANIMATE =
	SHELL_MAJOR >= 51
		? ({ animate: false } as unknown as PopupAnimation)
		: PopupAnimation.NONE;

function shouldAnimateClose(animateArg: unknown): boolean {
	if (!Global.QuickSettingsMenu.actor.visible) return false;
	if (animateArg === false || animateArg === PopupAnimation.NONE) return false;
	if (
		typeof animateArg === "object" &&
		animateArg !== null &&
		(animateArg as { animate?: boolean }).animate === false
	) {
		return false;
	}
	return true;
}

type TrackedSubmenu = QuickSettingsMenu & {
	_header?: St.Widget;
};

type QuickSettingsMenuInternal = QuickSettingsMenu & {
	_activeMenu?: { close: (animate?: PopupAnimation) => void } | null;
	_setDimmed: (dim: boolean) => void;
};

/**
 * Presents Quick Settings submenus as full-panel pages with a header back button
 * and horizontal slide transitions, replacing the main toggle grid while open.
 */
export class PageMenu extends FeatureBase {
	/** Slide transition duration in milliseconds, or `0` to disable animation. */
	duration: number;

	private tracker: QuickSettingsMenuTracker | null = null;
	private pageSizer: St.Widget | null = null;
	private overlayXBind: Clutter.BindConstraint | null = null;
	private overlayYBind: Clutter.BindConstraint | null = null;
	private overlayWidthBind: Clutter.BindConstraint | null = null;
	private overlayHeightBind: Clutter.BindConstraint | null = null;
	private overlayHeightClipBind: Clutter.BindConstraint | null = null;
	private gridOverlayConstraint: Clutter.Constraint | null = null;
	private defaultOverlayPosConstraints: Array<{
		constraint: Clutter.Constraint;
		enabled: boolean;
	}> = [];
	private defaultOverlayWidthConstraints: Array<{
		constraint: Clutter.Constraint;
		enabled: boolean;
	}> = [];
	private activeMenu: TrackedSubmenu | null = null;
	private savedBoxClip: boolean | null = null;
	private savedOverlayClip: boolean | null = null;
	private syncLaterId: number | null = null;

	/**
	 * Loads page transition settings from GSettings.
	 *
	 * @param loader - Setting loader bound to the extension schema
	 */
	override loadSettings(loader: SettingLoader): void {
		this.duration = loader.loadInt("page-menu-animate-duration");
	}

	/**
	 * Skips full feature reload when only the transition duration changes.
	 *
	 * @param changedKey - GSettings key that changed, if any
	 */
	override reload(changedKey?: string): void {
		if (changedKey === "page-menu-animate-duration") return;
		super.reload(changedKey);
	}

	/**
	 * Disables default dimming and placeholder expansion, sets up `pageSizer`,
	 * and starts tracking Quick Settings submenus.
	 */
	override onLoad(): void {
		const qsMenu = Global.QuickSettingsMenu as QuickSettingsMenuInternal;
		qsMenu._activeMenu?.close(CLOSE_NO_ANIMATE);

		const gridOverlay = (
			Global.QuickSettingsGrid.layout_manager as Clutter.LayoutManager & {
				_overlay?: Clutter.Actor;
			}
		)._overlay;
		this.gridOverlayConstraint = gridOverlay?.get_constraints()[0] ?? null;
		if (this.gridOverlayConstraint) {
			this.gridOverlayConstraint.enabled = false;
			this.maid.functionJob(() => {
				if (this.gridOverlayConstraint) {
					this.gridOverlayConstraint.enabled = true;
					this.gridOverlayConstraint = null;
				}
			});
		}

		this.maid.patchJob(qsMenu, "_setDimmed", () => () => {});
		const dimEffect = qsMenu._dimEffect;
		if (dimEffect) {
			const prevDimEnabled = dimEffect.enabled;
			dimEffect.enabled = false;
			this.maid.functionJob(() => {
				dimEffect.enabled = prevDimEnabled;
			});
		}

		this.pageSizer = new St.Widget({
			visible: false,
			x_expand: true,
			y_expand: false,
		});
		Global.QuickSettingsBox.add_child(this.pageSizer);
		this.maid.destroyJob(this.pageSizer);
		this.maid.functionJob(() => {
			this.pageSizer = null;
		});

		this.overlayHeightBind = new Clutter.BindConstraint({
			coordinate: Clutter.BindCoordinate.HEIGHT,
			enabled: false,
		});
		this.pageSizer.add_constraint(this.overlayHeightBind);

		const overlay = qsMenu._overlay;
		const boxPointer = qsMenu._boxPointer;
		this.defaultOverlayPosConstraints = [];
		this.defaultOverlayWidthConstraints = [];
		for (const constraint of overlay.get_constraints()) {
			if (!(constraint instanceof Clutter.BindConstraint)) continue;
			if (constraint.coordinate === Clutter.BindCoordinate.WIDTH) {
				this.defaultOverlayWidthConstraints.push({
					constraint,
					enabled: constraint.enabled,
				});
			} else if (
				constraint.coordinate === Clutter.BindCoordinate.X ||
				constraint.coordinate === Clutter.BindCoordinate.Y ||
				constraint.coordinate === Clutter.BindCoordinate.POSITION
			) {
				this.defaultOverlayPosConstraints.push({
					constraint,
					enabled: constraint.enabled,
				});
				constraint.enabled = false;
			}
		}

		// Replace _overlay X/Y constraints with ones derived from QuickSettingsBox (never _grid, whose translation_x shifts during slides).
		this.overlayXBind = new Clutter.BindConstraint({
			coordinate: Clutter.BindCoordinate.X,
			source: boxPointer,
		});
		this.overlayYBind = new Clutter.BindConstraint({
			coordinate: Clutter.BindCoordinate.Y,
			source: boxPointer,
		});
		this.overlayWidthBind = new Clutter.BindConstraint({
			coordinate: Clutter.BindCoordinate.WIDTH,
			source: this.pageSizer,
			enabled: false,
		});
		this.overlayHeightClipBind = new Clutter.BindConstraint({
			coordinate: Clutter.BindCoordinate.HEIGHT,
			source: Global.QuickSettingsBox,
			enabled: false,
		});
		overlay.add_constraint(this.overlayXBind);
		overlay.add_constraint(this.overlayYBind);
		overlay.add_constraint(this.overlayWidthBind);
		overlay.add_constraint(this.overlayHeightClipBind);
		this.syncOverlayOffsets();

		const syncOffsets = () => this.scheduleSyncOverlayOffsets();
		this.maid.connectJob(Global.QuickSettingsBox, "notify::x", syncOffsets);
		this.maid.connectJob(Global.QuickSettingsBox, "notify::y", syncOffsets);
		this.maid.connectJob(
			Global.QuickSettingsBox,
			"notify::allocation",
			syncOffsets,
		);
		this.maid.connectJob(Global.QuickSettingsBox, "style-changed", syncOffsets);
		this.maid.connectJob(boxPointer.bin, "notify::x", syncOffsets);
		this.maid.connectJob(boxPointer.bin, "notify::y", syncOffsets);
		this.maid.connectJob(boxPointer.bin, "notify::allocation", syncOffsets);

		this.maid.functionJob(() => {
			if (this.syncLaterId !== null) {
				global.compositor.get_laters().remove(this.syncLaterId);
				this.syncLaterId = null;
			}
			if (this.overlayXBind) {
				overlay.remove_constraint(this.overlayXBind);
				this.overlayXBind = null;
			}
			if (this.overlayYBind) {
				overlay.remove_constraint(this.overlayYBind);
				this.overlayYBind = null;
			}
			if (this.overlayWidthBind) {
				overlay.remove_constraint(this.overlayWidthBind);
				this.overlayWidthBind = null;
			}
			if (this.overlayHeightClipBind) {
				overlay.remove_constraint(this.overlayHeightClipBind);
				this.overlayHeightClipBind = null;
			}
			for (const entry of this.defaultOverlayPosConstraints) {
				entry.constraint.enabled = entry.enabled;
			}
			for (const entry of this.defaultOverlayWidthConstraints) {
				entry.constraint.enabled = entry.enabled;
			}
			this.defaultOverlayPosConstraints = [];
			this.defaultOverlayWidthConstraints = [];
			this.overlayHeightBind = null;
			this.setTransitionClipping(false);
		});

		this.maid.connectJob(
			qsMenu,
			"open-state-changed",
			(_menu: unknown, isOpen: boolean) => {
				if (!isOpen) this.resetToMainPageImmediate();
			},
		);

		this.tracker = new QuickSettingsMenuTracker();
		this.tracker.onMenuCreated = this.onMenuCreated.bind(this);
		this.tracker.load();
	}

	/**
	 * Restores the main page, unloads the submenu tracker, and lets `Maid` undo all patches.
	 */
	override onUnload(): void {
		this.resetToMainPageImmediate();
		const tracker = this.tracker;
		if (!tracker) return;
		this.tracker = null;
		tracker.unload();
	}

	private onMenuCreated(menuMaid: Maid, menu: TrackedSubmenu): void {
		const posConstraint = menu.actor.get_constraints()[0];
		if (posConstraint) {
			posConstraint.enabled = false;
			menuMaid.functionJob(() => {
				posConstraint.enabled = true;
			});
		}

		menu.box.add_style_class_name("QSTWEAKS-page-menu");
		menuMaid.functionJob(() => {
			menu.box.remove_style_class_name("QSTWEAKS-page-menu");
		});

		this.injectBackButton(menuMaid, menu);

		menuMaid.patchJob(menu, "open", (origOpen) => {
			const orig = origOpen as (...args: unknown[]) => unknown;
			return (...args: unknown[]) => {
				const res = orig.apply(menu, args);
				menu.actor.remove_all_transitions();
				menu.box.remove_all_transitions();
				menu.actor.height = -1;
				menu.box.opacity = 255;
				if (menu.isOpen) this.enterSubPage(menu);
				return res;
			};
		});

		menuMaid.patchJob(menu, "close", (origClose) => {
			const orig = origClose as (...args: unknown[]) => unknown;
			return (...args: unknown[]) => {
				if (!menu.isOpen) return orig.apply(menu, args);
				const shouldAnimate = shouldAnimateClose(args[0]);
				const res = orig.apply(menu, args);
				menu.box.remove_all_transitions();
				menu.actor.remove_all_transitions();
				this.exitSubPage(menu, shouldAnimate);
				return res;
			};
		});

		menuMaid.connectJob(menu, "destroy", () => {
			if (this.activeMenu === menu) this.resetToMainPageImmediate();
		});

		if (menu.sourceActor) {
			menuMaid.connectJob(menu.sourceActor, "notify::visible", () => {
				if (this.activeMenu === menu && !menu.sourceActor.visible) {
					this.resetToMainPageImmediate();
				}
			});
		}
	}

	private injectBackButton(menuMaid: Maid, menu: TrackedSubmenu): void {
		const headerRow = new St.BoxLayout({
			style_class: "QSTWEAKS-page-header-row",
			x_expand: true,
		});
		const backButton = new St.Button({
			style_class: "icon-button QSTWEAKS-page-back-button",
			can_focus: true,
			y_align: Clutter.ActorAlign.CENTER,
			accessible_name: _("Back"),
			child: new St.Icon({ icon_name: "go-previous-symbolic" }),
		});
		menuMaid.connectJob(backButton, "clicked", () => menu.close());
		headerRow.add_child(backButton);

		const header = menu._header;
		const origHeaderXExpand = header ? header.x_expand : false;
		if (header) {
			if (header.get_parent() === menu.box) menu.box.remove_child(header);
			header.x_expand = true;
			headerRow.add_child(header);
		}
		menu.box.insert_child_at_index(headerRow, 0);

		menuMaid.functionJob(() => {
			if (header && header.get_parent() === headerRow) {
				headerRow.remove_child(header);
				header.x_expand = origHeaderXExpand;
				menu.box.insert_child_at_index(header, 0);
			}
			headerRow.destroy();
		});
	}

	private getSlideOffset(width: number): number {
		const isRtl =
			Global.QuickSettingsBox.get_text_direction() ===
			Clutter.TextDirection.RTL;
		return isRtl ? -width : width;
	}

	private setTransitionClipping(enabled: boolean): void {
		const box = Global.QuickSettingsBox;
		const overlay = Global.QuickSettingsMenu._overlay;
		if (enabled) {
			if (this.savedBoxClip === null)
				this.savedBoxClip = box.clip_to_allocation;
			if (this.savedOverlayClip === null)
				this.savedOverlayClip = overlay.clip_to_allocation;
			box.clip_to_allocation = true;
			overlay.clip_to_allocation = true;
			return;
		}
		if (this.savedBoxClip !== null) {
			box.clip_to_allocation = this.savedBoxClip;
			this.savedBoxClip = null;
		}
		if (this.savedOverlayClip !== null) {
			overlay.clip_to_allocation = this.savedOverlayClip;
			this.savedOverlayClip = null;
		}
	}

	private scheduleSyncOverlayOffsets(): void {
		if (this.syncLaterId !== null) return;
		this.syncLaterId = global.compositor
			.get_laters()
			.add(Meta.LaterType.BEFORE_REDRAW, () => {
				this.syncLaterId = null;
				this.syncOverlayOffsets();
				return GLib.SOURCE_REMOVE;
			});
	}

	private syncOverlayOffsets(): void {
		const box = Global.QuickSettingsBox;
		const boxPointer = Global.QuickSettingsMenu._boxPointer;
		const themeNode = box.get_theme_node();
		const padLeft =
			themeNode.get_padding(St.Side.LEFT) +
			themeNode.get_border_width(St.Side.LEFT);
		const padTop =
			themeNode.get_padding(St.Side.TOP) +
			themeNode.get_border_width(St.Side.TOP);
		const padBottom =
			themeNode.get_padding(St.Side.BOTTOM) +
			themeNode.get_border_width(St.Side.BOTTOM);
		const boxOffset = box.apply_relative_transform_to_point(
			boxPointer,
			new Graphene.Point3D(),
		);
		const nextX = boxOffset.x + padLeft;
		const nextY = boxOffset.y + padTop;
		const nextClipH = -(padTop + padBottom);
		if (this.overlayXBind && this.overlayXBind.offset !== nextX)
			this.overlayXBind.offset = nextX;
		if (this.overlayYBind && this.overlayYBind.offset !== nextY)
			this.overlayYBind.offset = nextY;
		if (
			this.overlayHeightClipBind &&
			this.overlayHeightClipBind.offset !== nextClipH
		)
			this.overlayHeightClipBind.offset = nextClipH;
	}

	private restoreOverlayWidthConstraint(): void {
		if (this.overlayWidthBind) this.overlayWidthBind.enabled = false;
		for (const entry of this.defaultOverlayWidthConstraints) {
			entry.constraint.enabled = entry.enabled;
		}
	}

	private getGridWidth(): number {
		const grid = Global.QuickSettingsGrid;
		if (grid.width > 0) return grid.width;
		if (this.pageSizer && this.pageSizer.width > 0) return this.pageSizer.width;
		return grid.get_preferred_width(-1)[1];
	}

	private activatePageSizer(menu: TrackedSubmenu, gridWidth: number): void {
		if (!this.pageSizer || !this.overlayWidthBind || !this.overlayHeightBind)
			return;
		this.pageSizer.width = gridWidth;
		this.pageSizer.style = `min-width: ${gridWidth}px;`;
		this.pageSizer.height = -1;
		this.pageSizer.show();
		for (const entry of this.defaultOverlayWidthConstraints) {
			entry.constraint.enabled = false;
		}
		this.overlayWidthBind.enabled = true;
		this.overlayHeightBind.source = menu.actor;
		this.overlayHeightBind.enabled = true;
	}

	private deactivatePageSizer(): void {
		if (this.overlayHeightClipBind) this.overlayHeightClipBind.enabled = false;
		if (this.overlayHeightBind) {
			this.overlayHeightBind.enabled = false;
			this.overlayHeightBind.source = null;
		}
		if (this.pageSizer) {
			this.pageSizer.hide();
			this.pageSizer.height = -1;
			this.pageSizer.style = "";
		}
		this.restoreOverlayWidthConstraint();
	}

	private enterSubPage(menu: TrackedSubmenu): void {
		if (!this.pageSizer || !this.overlayWidthBind || !this.overlayHeightBind)
			return;

		this.activeMenu = menu;
		const box = Global.QuickSettingsBox;
		const grid = Global.QuickSettingsGrid;
		box.remove_all_transitions();
		grid.remove_all_transitions();
		this.pageSizer.remove_all_transitions();
		menu.actor.remove_all_transitions();
		menu.box.remove_all_transitions();

		const gridWidth = this.getGridWidth();
		const startBoxHeight =
			box.height > 0 ? box.height : box.get_preferred_height(gridWidth)[1];

		this.deactivatePageSizer();

		menu.actor.height = -1;
		const [, menuHeight] = menu.actor.get_preferred_height(gridWidth);
		const [, targetBoxHeight] = box
			.get_theme_node()
			.adjust_preferred_height(menuHeight, menuHeight);
		this.syncOverlayOffsets();

		if (!this.duration || !Global.QuickSettingsMenu.actor.visible) {
			grid.hide();
			grid.translation_x = 0;
			grid.opacity = 255;
			box.height = -1;
			this.activatePageSizer(menu, gridWidth);
			menu.actor.translation_x = 0;
			menu.actor.opacity = 255;
			this.setTransitionClipping(false);
			return;
		}

		const slideOffset = this.getSlideOffset(gridWidth);
		const wasGridVisible = grid.visible;
		if (!wasGridVisible) {
			grid.translation_x = 0;
			grid.opacity = 255;
		}

		box.height = startBoxHeight;
		if (this.overlayHeightClipBind) this.overlayHeightClipBind.enabled = true;
		this.setTransitionClipping(true);
		grid.show();

		box.ease({
			height: targetBoxHeight,
			duration: this.duration,
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
		});

		grid.ease({
			translationX: -slideOffset,
			opacity: 0,
			duration: this.duration,
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
		});

		menu.actor.translation_x = slideOffset;
		menu.actor.opacity = 0;
		menu.actor.ease({
			translationX: 0,
			opacity: 255,
			duration: this.duration,
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
			onComplete: () => {
				if (this.activeMenu !== menu) return;
				grid.hide();
				grid.translation_x = 0;
				grid.opacity = 255;
				this.activatePageSizer(menu, gridWidth);
				if (this.overlayHeightClipBind)
					this.overlayHeightClipBind.enabled = false;
				box.height = -1;
				this.setTransitionClipping(false);
			},
		});
	}

	private exitSubPage(menu: TrackedSubmenu, shouldAnimate: boolean): void {
		if (this.activeMenu === menu) this.activeMenu = null;

		if (this.overlayHeightBind) {
			this.overlayHeightBind.enabled = false;
			this.overlayHeightBind.source = null;
		}

		const focusActor = global.stage.get_key_focus();
		if (
			Global.QuickSettingsMenu.actor.visible &&
			focusActor &&
			menu.actor.contains(focusActor)
		) {
			const source = menu.sourceActor as Clutter.Actor & {
				_menuButton?: Clutter.Actor;
			};
			(source?._menuButton ?? source)?.grab_key_focus();
		}

		if (this.activeMenu !== null) {
			menu.actor.hide();
			menu.actor.translation_x = 0;
			menu.actor.opacity = 255;
			menu.emit("menu-closed");
			return;
		}

		if (!shouldAnimate || !this.duration || !this.pageSizer) {
			menu.actor.hide();
			menu.actor.translation_x = 0;
			menu.actor.opacity = 255;
			menu.emit("menu-closed");
			this.resetToMainPageImmediate();
			return;
		}

		const box = Global.QuickSettingsBox;
		const grid = Global.QuickSettingsGrid;
		const gridWidth = this.getGridWidth();
		const startBoxHeight =
			box.height > 0 ? box.height : box.get_preferred_height(gridWidth)[1];
		const slideOffset = this.getSlideOffset(gridWidth);
		const wasGridVisible = grid.visible;

		box.remove_all_transitions();
		grid.remove_all_transitions();
		this.pageSizer.remove_all_transitions();
		menu.actor.remove_all_transitions();

		this.deactivatePageSizer();

		box.height = -1;
		if (!wasGridVisible) {
			grid.translation_x = -slideOffset;
			grid.opacity = 0;
		}
		grid.show();
		const [, targetBoxHeight] = box.get_preferred_height(gridWidth);
		this.syncOverlayOffsets();

		box.height = startBoxHeight;
		if (this.overlayHeightClipBind) this.overlayHeightClipBind.enabled = true;
		this.setTransitionClipping(true);

		box.ease({
			height: targetBoxHeight,
			duration: this.duration,
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
		});

		grid.ease({
			translationX: 0,
			opacity: 255,
			duration: this.duration,
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
		});

		menu.actor.ease({
			translationX: slideOffset,
			opacity: 0,
			duration: this.duration,
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
			onComplete: () => {
				if (this.activeMenu !== menu) {
					menu.actor.hide();
					menu.actor.translation_x = 0;
					menu.actor.opacity = 255;
					menu.emit("menu-closed");
				}
				if (this.activeMenu === null) {
					if (this.overlayHeightClipBind)
						this.overlayHeightClipBind.enabled = false;
					box.height = -1;
					this.setTransitionClipping(false);
				}
			},
		});
	}

	private resetToMainPageImmediate(): void {
		const prevMenu = this.activeMenu;
		this.activeMenu = null;

		const box = Global.QuickSettingsBox;
		const grid = Global.QuickSettingsGrid;
		box.remove_all_transitions();
		grid.remove_all_transitions();
		this.pageSizer?.remove_all_transitions();
		prevMenu?.actor.remove_all_transitions();

		this.deactivatePageSizer();

		box.height = -1;
		grid.show();
		grid.translation_x = 0;
		grid.opacity = 255;
		this.setTransitionClipping(false);

		if (prevMenu) {
			if (prevMenu.isOpen) {
				prevMenu.close(CLOSE_NO_ANIMATE);
			} else {
				prevMenu.actor.hide();
				prevMenu.actor.translation_x = 0;
				prevMenu.actor.opacity = 255;
				prevMenu.emit("menu-closed");
			}
		}
	}
}
