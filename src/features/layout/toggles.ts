import {
	QuickMenuToggle,
	QuickToggle,
} from "resource:///org/gnome/shell/ui/quickSettings.js";
import Global from "../../global.js";
import type Maid from "../../libs/shared/maid.js";
import { FeatureBase, type SettingLoader } from "../../libs/shell/feature.js";
import { QuickSettingsToggleTracker } from "../../libs/shell/quickSettingsUtils.js";
import { ToggleOrderItem } from "../../libs/types/toggleOrderItem.js";

/**
 * Customizes visibility and ordering of Quick Settings toggles in the grid.
 * Exists to hide unwanted toggles and arrange remaining toggles around a `nonOrdered` anchor.
 */
export class TogglesLayoutFeature extends FeatureBase {
	// #region settings
	/** Whether toggle layout customization is enabled. */
	enabled: boolean;
	/** Ordered list of toggle matching rules, including compiled title regexes. */
	order: ToggleOrderItem[];
	/** Fallback rule applied to toggles not explicitly matched in `order`. */
	unordered: ToggleOrderItem;

	/**
	 * Loads toggle layout settings and precompiles any `titleRegex` patterns.
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
	}
	// #endregion settings

	/**
	 * Hides a newly created toggle if its matching order rule specifies `hide`.
	 *
	 * @param maid - Cleanup maid tied to the toggle's lifecycle
	 * @param toggle - Newly created `QuickToggle` or `QuickMenuToggle` instance
	 */
	onToggleCreated(maid: Maid, toggle: QuickToggle | QuickMenuToggle): void {
		const rule: ToggleOrderItem =
			this.order.find((item) => ToggleOrderItem.toggleMatch(item, toggle)) ??
			this.unordered;
		if (rule.hide) maid.hideJob(toggle);
	}
	/**
	 * Reorders toggles in `Global.QuickSettingsGrid` according to `this.order`.
	 * Excludes `BackgroundAppsToggle` and places unmatched toggles at the `nonOrdered` position.
	 */
	onUpdate(): void {
		const children = Global.QuickSettingsGrid.get_children();
		const head: (QuickToggle | QuickMenuToggle)[] = [];
		const middle: (QuickToggle | QuickMenuToggle)[] = children.filter(
			(child): child is QuickToggle | QuickMenuToggle =>
				(child instanceof QuickMenuToggle || child instanceof QuickToggle) &&
				child.constructor.name !== "BackgroundAppsToggle",
		);
		const tail: (QuickToggle | QuickMenuToggle)[] = [];
		let overNonOrdered: boolean = false;
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
		let last: QuickToggle | QuickMenuToggle | null = null;
		for (const item of [head, middle, tail].flat()) {
			if (last) Global.QuickSettingsGrid.set_child_above_sibling(item, last);
			last = item;
		}
	}

	/** Tracker monitoring `Global.QuickSettingsGrid` toggle additions and updates. */
	tracker: QuickSettingsToggleTracker;

	/**
	 * Starts the toggle tracker when toggle layout customization is enabled.
	 */
	override onLoad(): void {
		if (!this.enabled) return;
		this.tracker = new QuickSettingsToggleTracker();
		this.tracker.onToggleCreated = this.onToggleCreated.bind(this);
		this.tracker.onUpdate = this.onUpdate.bind(this);
		this.tracker.load();
	}
	/**
	 * Unloads the toggle tracker and clears its reference.
	 */
	override onUnload(): void {
		const tracker = this.tracker;
		if (tracker) {
			this.tracker = null;
			tracker.unload();
		}
	}
}
