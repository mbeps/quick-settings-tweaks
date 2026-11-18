import Clutter from "gi://Clutter";
import { PopupAnimation } from "resource:///org/gnome/shell/ui/boxpointer.js";
import {
	type QuickSettingsMenu,
	QuickSlider,
} from "resource:///org/gnome/shell/ui/quickSettings.js";
import Global from "../global.js";
import type Maid from "../libs/shared/maid.js";
import * as AdvAni from "../libs/shell/advani.js";
import { FeatureBase, type SettingLoader } from "../libs/shell/feature.js";
import { QuickSettingsMenuTracker } from "../libs/shell/quickSettingsUtils.js";

/**
 * Turns Quick Settings submenus into centered or anchored floating overlay dialogs.
 * Exists to prevent submenus from expanding the Quick Settings grid height and to add flyout/dialog animations.
 */
export class OverlayMenu extends FeatureBase {
	// #region settings
	/** Fixed width in pixels for overlay menus, or `0` to keep default width. */
	width: number;
	/** Open animation duration in milliseconds, or `0` to disable animation. */
	duration: number;
	/** Animation style (`"flyout"` or `"dialog"`). */
	animationStyle: string;
	/** Vertical anchor when menu height exceeds `QuickSettingsBox` (`"center"`, `"top"`, or `"bottom"`). */
	overflowAnchor: string;

	/**
	 * Loads overlay menu sizing, animation, and anchor settings from GSettings.
	 *
	 * @param loader - Setting loader bound to the extension schema
	 */
	override loadSettings(loader: SettingLoader): void {
		this.width = loader.loadInt("overlay-menu-width");
		this.duration = loader.loadInt("overlay-menu-animate-duration");
		this.animationStyle = loader.loadString("overlay-menu-animate-style");
		this.overflowAnchor = loader.loadString("overlay-menu-overflow-anchor");
	}
	// #endregion settings

	/**
	 * Computes target overlay dimensions, centered/anchored offsets, and source actor bounds.
	 *
	 * @param menu - Submenu whose geometry is being calculated
	 * @returns Computed dimensions, source coordinates, and overlay constraint offsets
	 */
	getCoords(menu: QuickSettingsMenu): {
		outerHeight: number;
		targetHeight: number;
		targetWidth: number;
		sourceX: number;
		sourceY: number;
		sourceHeight: number;
		sourceWidth: number;
		offsetY: number;
		offsetX: number;
	} {
		menu.actor.height = -1;
		const [outerHeight] = menu.actor.get_preferred_height(-1);
		const targetWidth =
			menu.actor.width - menu.box.marginLeft - menu.box.marginRight;
		const targetHeight = outerHeight - menu.box.marginTop;
		let offsetY: number;
		if (
			Global.QuickSettingsBox.height < targetHeight &&
			this.overflowAnchor !== "center"
		) {
			// When menu is taller than Quick Settings box and anchor is set
			if (this.overflowAnchor === "top") {
				// Top anchor: menu top aligns with box top, overflows downward
				offsetY = 0;
			} else {
				// Bottom anchor: menu bottom aligns with box bottom, overflows upward
				// Ensure offsetY doesn't go negative to prevent menu from positioning above the box
				offsetY = Math.max(0, Global.QuickSettingsBox.height - targetHeight);
			}
		} else {
			offsetY = Math.floor((Global.QuickSettingsBox.height - targetHeight) / 2);
		}
		const isSlider = menu.sourceActor instanceof QuickSlider;
		const sourceHeight = Math.floor(menu.sourceActor.height + 0.5);
		const sourceBaseWidth = Math.floor(menu.sourceActor.width + 0.5);
		const sourceWidth = isSlider ? sourceHeight : sourceBaseWidth;
		const sourceBaseX = Math.floor(
			Global.QuickSettingsGrid.x + menu.sourceActor.x + 0.5,
		);
		const sourceY = Math.floor(
			Global.QuickSettingsGrid.y + menu.sourceActor.y + 0.5,
		);
		const sourceX =
			sourceBaseX + (isSlider ? sourceBaseWidth - sourceWidth : 0);
		const offsetX = Math.floor(
			(Global.QuickSettingsBox.width - targetWidth) / 2,
		);
		return {
			outerHeight,
			targetHeight,
			targetWidth,
			sourceX,
			sourceY,
			sourceHeight,
			sourceWidth,
			offsetY,
			offsetX,
		};
	}

	/**
	 * Positions and animates the overlay menu when it opens.
	 *
	 * @param _maid - Cleanup maid for the open state
	 * @param menu - Submenu being opened or closed
	 * @param isOpen - Whether the submenu is opening (`true`) or closing (`false`)
	 */
	onOpen(_maid: Maid, menu: QuickSettingsMenu, isOpen: boolean) {
		if (!isOpen || !this.duration) menu.actor.set_easing_duration(0);
		else menu.actor.remove_all_transitions();
		if (!isOpen) return;

		const coords = this.getCoords(menu);
		this.xconstraint.offset = coords.offsetX;
		this.yconstraint.offset = coords.offsetY;

		if (this.duration) {
			menu.box.opacity = 0;
			menu.box.ease({
				opacity: 255,
				duration: Math.floor(this.duration / 3),
			});
			if (this.animationStyle === "flyout") {
				menu.box.translation_x = Math.floor(
					coords.sourceX - coords.offsetX + menu.box.marginLeft,
				);
				menu.box.translation_y = Math.floor(
					coords.sourceY - coords.offsetY + menu.box.marginTop,
				);
				menu.box.scale_x = coords.sourceWidth / coords.targetWidth;
				menu.box.scale_y = coords.sourceHeight / coords.targetHeight;
				AdvAni.ease(menu.box, {
					translation_x: 0,
					translation_y: 0,
					scale_x: 1,
					scale_y: 1,
					mode: AdvAni.AdvAnimationMode.LowBackover,
					// mode: Clutter.AnimationMode.EASE_OUT_EXPO,
					duration: this.duration,
				});
			} else if (this.animationStyle === "dialog") {
				menu.box.translation_x = 0.2 * coords.targetWidth * 0.5;
				menu.box.translation_y = 0.2 * coords.targetHeight * 0.5;
				menu.box.scale_x = 0.8;
				menu.box.scale_y = 0.8;
				AdvAni.ease(menu.box, {
					translation_x: 0,
					translation_y: 0,
					scale_x: 1,
					scale_y: 1,
					mode: AdvAni.AdvAnimationMode.MiddleBackover,
					// mode: Clutter.AnimationMode.EASE_OUT_EXPO,
					duration: this.duration,
				});
			}
		}
	}

	/**
	 * Disables default menu positioning constraints, applies configured width, and tracks height changes.
	 *
	 * @param maid - Cleanup maid tied to the menu's lifecycle
	 * @param menu - Newly created `QuickSettingsMenu` instance
	 */
	onMenuCreated(maid: Maid, menu: QuickSettingsMenu) {
		menu.actor.get_constraints()[0].enabled = false;
		if (this.width) {
			menu.actor.width = this.width;
			menu.actor.x_expand = false;
			menu.actor.x_align = Clutter.ActorAlign.CENTER;
		}
		maid.connectJob(menu.box, "notify::height", () => {
			if (!menu.isOpen) return;
			const coords = this.getCoords(menu);
			this.yconstraint.offset = coords.offsetY;
			this.xconstraint.offset = coords.offsetX;
		});
	}

	/** Tracker monitoring Quick Settings submenu creation and open/close events. */
	tracker: QuickSettingsMenuTracker;
	/** Horizontal bind constraint positioning `_overlay` relative to `_boxPointer`. */
	xconstraint: Clutter.BindConstraint;
	/** Vertical bind constraint positioning `_overlay` relative to `_boxPointer`. */
	yconstraint: Clutter.BindConstraint;

	/**
	 * Skips full feature reload for animation/anchor settings that are read dynamically on open.
	 *
	 * @param changedKey - GSettings key that changed, if any
	 */
	override reload(changedKey?: string): void {
		if (changedKey === "overlay-menu-animate-duration") return;
		if (changedKey === "overlay-menu-animate-style") return;
		if (changedKey === "overlay-menu-overflow-anchor") return;
		super.reload(changedKey);
	}
	/**
	 * Replaces default overlay constraints and starts the submenu tracker.
	 */
	override onLoad(): void {
		// Offset handle for Y
		this.yconstraint = new Clutter.BindConstraint({
			coordinate: Clutter.BindCoordinate.Y,
			source: Global.QuickSettingsMenu._boxPointer,
		});

		// Offset handle for X
		this.xconstraint = new Clutter.BindConstraint({
			coordinate: Clutter.BindCoordinate.X,
			source: Global.QuickSettingsMenu._boxPointer,
		});

		// Disable default sync (overlay x&y offset)
		Global.QuickSettingsMenu._overlay.get_constraints()[0].enabled = false;
		Global.QuickSettingsMenu._overlay.add_constraint(this.yconstraint);
		Global.QuickSettingsMenu._overlay.add_constraint(this.xconstraint);

		// Disable Placeholder height sync (grid height increase)
		// @ts-expect-error Overlay is private field
		Global.QuickSettingsGrid.layout_manager._overlay.get_constraints()[0].enabled = false;

		this.tracker = new QuickSettingsMenuTracker();
		this.tracker.onMenuCreated = this.onMenuCreated.bind(this);
		this.tracker.onMenuOpen = this.onOpen.bind(this);
		this.tracker.load();
	}
	/**
	 * Restores default menu and overlay constraints and unloads the submenu tracker.
	 */
	override onUnload(): void {
		const tracker = this.tracker;
		if (!tracker) return;
		this.tracker = null;
		const activeMenu = (
			Global.QuickSettingsMenu as unknown as {
				_activeMenu?: { close: (animate?: PopupAnimation) => void };
			}
		)._activeMenu;
		activeMenu?.close(PopupAnimation.NONE);
		for (const menu of tracker.items) {
			menu.box.remove_all_transitions();
			menu.box.translation_x = 0;
			menu.box.translation_y = 0;
			menu.box.scale_x = 1;
			menu.box.scale_y = 1;
			menu.box.opacity = 255;
			menu.actor.x_expand = true;
			menu.actor.get_constraints()[0].enabled = true;
		}
		tracker.unload();
		Global.QuickSettingsMenu._overlay.get_constraints()[0].enabled = true;
		// @ts-expect-error Overlay is private field
		Global.QuickSettingsGrid.layout_manager._overlay.get_constraints()[0].enabled = true;
		Global.QuickSettingsMenu._overlay.remove_constraint(this.yconstraint);
		Global.QuickSettingsMenu._overlay.remove_constraint(this.xconstraint);
	}
}
