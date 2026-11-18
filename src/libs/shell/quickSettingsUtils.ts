import type Clutter from "gi://Clutter";
import type St from "gi://St";
import {
	type PopupMenuBase,
	PopupSeparatorMenuItem,
} from "resource:///org/gnome/shell/ui/popupMenu.js";
import {
	QuickMenuToggle,
	type QuickSettingsMenu,
	QuickToggle,
	SystemIndicator,
} from "resource:///org/gnome/shell/ui/quickSettings.js";
import Global from "../../global.js";
import Maid from "../shared/maid.js";

/**
 * Base class for tracking dynamically added and removed children of a `St.Widget` container.
 * Associates each tracked item of type `T` with a `Maid` for automatic per-item cleanup.
 */
export abstract class ChildrenTrackerBase<T> {
	/** Map of tracked items to their per-item cleanup `Maid`. */
	appliedChild: Map<T, Maid>;
	/** Signal connection ID for `child-added` on `connectTarget`. */
	addConnection: number;
	/** Signal connection ID for `child-removed` on `connectTarget`. */
	removeConnection: number;
	/** Container widget whose children are being tracked. */
	connectTarget: St.Widget;

	/** Returns the `St.Widget` container to observe for child additions. */
	protected abstract getConnectTarget(): St.Widget;

	/** Processes a newly added or existing child actor. */
	protected abstract catchChild(child: Clutter.Actor): void;

	/**
	 * Connects to `child-added` and `child-removed` on the target container and processes all existing children.
	 */
	load(): void {
		const connectTarget = this.getConnectTarget();
		this.connectTarget = connectTarget;
		this.appliedChild = new Map();
		this.addConnection = connectTarget.connect("child-added", (_, child) => {
			this.catchChild(child);
			if (this.onUpdate) this.onUpdate();
		});
		this.removeConnection = connectTarget.connect("child-removed", () => {
			if (this.onUpdate) this.onUpdate();
		});
		for (const child of connectTarget.get_children()) {
			this.catchChild(child);
		}
		if (this.onUpdate) this.onUpdate();
	}

	/**
	 * Destroys all per-item `Maid` instances and disconnects from the container.
	 */
	unload(): void {
		for (const maid of this.appliedChild.values()) {
			maid.destroy();
		}
		this.connectTarget.disconnect(this.addConnection);
		this.connectTarget.disconnect(this.removeConnection);
		this.addConnection = null;
		this.removeConnection = null;
		this.appliedChild = null;
	}

	/**
	 * Returns all currently tracked items.
	 */
	get items(): T[] {
		if (!this.appliedChild) return [];
		return [...this.appliedChild.keys()];
	}

	/** Optional callback invoked after initial load and whenever a child is added. */
	onUpdate: () => void;
}

/**
 * Tracks `QuickSettingsMenu` instances attached to children of `Global.QuickSettingsGrid`.
 * Fires `onMenuCreated` when a menu is discovered and `onMenuOpen` when its open state changes.
 */
export class QuickSettingsMenuTracker extends ChildrenTrackerBase<QuickSettingsMenu> {
	/** Callback invoked when a tracked menu's `open-state-changed` signal fires. */
	onMenuOpen: (maid: Maid, menu: QuickSettingsMenu, isOpen: boolean) => void;
	/** Callback invoked when a new `QuickSettingsMenu` is first tracked. */
	onMenuCreated: (maid: Maid, menu: QuickSettingsMenu) => void;
	protected override catchChild(child: Clutter.Actor): void {
		const menu = (child as Clutter.Actor & { menu?: QuickSettingsMenu }).menu;
		if (!menu) return;
		if (this.appliedChild.has(menu)) return;

		const menuMaid = new Maid();
		menuMaid.functionJob(() => {
			this.appliedChild.delete(menu);
		});
		menuMaid.connectJob(
			menu,
			"open-state-changed",
			(_: unknown, isOpen: boolean) => {
				if (this.onMenuOpen) this.onMenuOpen(menuMaid, menu, isOpen);
			},
		);
		menuMaid.connectJob(menu, "destroy", () => {
			menuMaid.destroy();
		});
		if (this.onMenuCreated) this.onMenuCreated(menuMaid, menu);
		this.appliedChild.set(menu, menuMaid);
	}
	protected override getConnectTarget() {
		return Global.QuickSettingsGrid;
	}

	/**
	 * Returns all currently tracked `QuickSettingsMenu` instances.
	 */
	get menus() {
		if (!this.appliedChild) return [];
		return [...this.appliedChild.keys()];
	}
}

/**
 * Tracks `QuickToggle` and `QuickMenuToggle` instances inside `Global.QuickSettingsGrid`.
 */
export class QuickSettingsToggleTracker extends ChildrenTrackerBase<
	QuickToggle | QuickMenuToggle
> {
	/** Callback invoked when a new toggle is first tracked. */
	onToggleCreated: (maid: Maid, toggle: QuickToggle | QuickMenuToggle) => void;
	protected override catchChild(child: Clutter.Actor): void {
		if (!(child instanceof QuickToggle) && !(child instanceof QuickMenuToggle))
			return;
		if (this.appliedChild.has(child)) return;

		const toggleMaid = new Maid();
		toggleMaid.functionJob(() => {
			this.appliedChild.delete(child);
		});
		toggleMaid.connectJob(child, "destroy", () => {
			toggleMaid.destroy();
		});
		toggleMaid.connectJob(child, "notify::visible", () => {
			if (this.onUpdate) this.onUpdate();
		});
		if (this.onToggleCreated) this.onToggleCreated(toggleMaid, child);
		this.appliedChild.set(child, toggleMaid);
	}
	protected override getConnectTarget() {
		return Global.QuickSettingsGrid;
	}
}

/**
 * Tracks `SystemIndicator` instances inside `Global.Indicators`.
 */
export class SystemIndicatorTracker extends ChildrenTrackerBase<SystemIndicator> {
	/** Callback invoked when a new `SystemIndicator` is first tracked. */
	onIndicatorCreated: (maid: Maid, indicator: SystemIndicator) => void;
	protected override catchChild(child: Clutter.Actor): void {
		if (!(child instanceof SystemIndicator)) return;
		if (this.appliedChild.has(child)) return;

		const indicatorMaid = new Maid();
		indicatorMaid.functionJob(() => {
			this.appliedChild.delete(child);
		});
		indicatorMaid.connectJob(child, "destroy", () => {
			indicatorMaid.destroy();
		});
		if (this.onIndicatorCreated) this.onIndicatorCreated(indicatorMaid, child);
		this.appliedChild.set(child, indicatorMaid);
	}
	protected override getConnectTarget() {
		return Global.Indicators;
	}
}

/**
 * Recalculates visibility for all `PopupSeparatorMenuItem` children in a `PopupMenuBase`.
 *
 * @param menu - Popup menu whose separators should be updated
 */
export function updateMenuSeparators(menu: PopupMenuBase) {
	for (const item of menu._getMenuItems()) {
		if (!(item instanceof PopupSeparatorMenuItem)) {
			continue;
		}
		menu._updateSeparatorVisibility(item);
	}
}
