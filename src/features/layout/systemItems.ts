import type Clutter from "gi://Clutter";
import type { QuickSettingsItem } from "resource:///org/gnome/shell/ui/quickSettings.js";
import type {
	PowerToggle,
	SystemItem,
} from "resource:///org/gnome/shell/ui/status/system.js";
import Global from "../../global.js";
import Logger from "../../libs/shared/logger.js";
import { FeatureBase, type SettingLoader } from "../../libs/shell/feature.js";

/**
 * Customizes visibility and ordering of the Quick Settings system action bar items.
 * Exists to hide individual buttons (screenshot, settings, lock, shutdown, battery) or the entire row, and reorder them.
 */
export class SystemItemsLayoutFeature extends FeatureBase {
	// #region settings
	/** Whether to hide the screenshot button. */
	hideScreenshot: boolean;
	/** Whether to hide the settings button. */
	hideSettings: boolean;
	/** Whether to hide the lock button. */
	hideLock: boolean;
	/** Whether to hide the shutdown/power-off button. */
	hideShutdown: boolean;
	/** Whether to hide the battery/power indicator toggle. */
	hideBattery: boolean;
	/** Whether to hide the entire system items row. */
	hideLayout: boolean;
	/** Whether system items layout customization is enabled. */
	enabled: boolean;
	/** Ordered list of item keys matching the object returned by `getItmes`. */
	order: string[];

	/**
	 * Loads system items visibility and ordering settings from GSettings.
	 *
	 * @param loader - Setting loader bound to the extension schema
	 */
	override loadSettings(loader: SettingLoader): void {
		this.hideScreenshot = loader.loadBoolean(
			"system-items-layout-hide-screenshot",
		);
		this.hideSettings = loader.loadBoolean("system-items-layout-hide-settings");
		this.hideLock = loader.loadBoolean("system-items-layout-hide-lock");
		this.hideShutdown = loader.loadBoolean("system-items-layout-hide-shutdown");
		this.hideBattery = loader.loadBoolean("system-items-layout-hide-battery");
		this.hideLayout = loader.loadBoolean("system-items-layout-hide");
		this.enabled = loader.loadBoolean("system-items-layout-enabled");
		this.order = loader.loadStrv("system-items-layout-order");
	}
	// #endregion settings

	/**
	 * Resolves and returns references to all system item actors and spacers.
	 *
	 * @returns Map of system item actors, spacers, and the parent `SystemItem` container
	 */
	async getItmes(): Promise<{
		screenshot: QuickSettingsItem;
		settings: QuickSettingsItem;
		lock: QuickSettingsItem;
		shutdown: QuickSettingsItem;
		battery: PowerToggle;
		box: SystemItem;
		laptopSpacer: Clutter.Actor;
		desktopSpacer: Clutter.Actor;
	}> {
		const systemItem = await Global.QuickSettingsSystemItem;
		const children = systemItem.child.get_children();
		let screenshotItem: QuickSettingsItem;
		let settingsItem: QuickSettingsItem;
		let lockItem: QuickSettingsItem;
		let shutdownItem: QuickSettingsItem;
		for (const child of children) {
			if (child.constructor.name === "ScreenshotItem") {
				screenshotItem = child as QuickSettingsItem;
				continue;
			}
			if (child.constructor.name === "SettingsItem") {
				settingsItem = child as QuickSettingsItem;
				continue;
			}
			if (child.constructor.name === "LockItem") {
				lockItem = child as QuickSettingsItem;
				continue;
			}
			if (child.constructor.name === "ShutdownItem") {
				shutdownItem = child as QuickSettingsItem;
			}
		}
		const systemItemInternal = systemItem as unknown as {
			_laptopSpacer: Clutter.Actor;
			_desktopSpacer: Clutter.Actor;
		};
		return {
			screenshot: screenshotItem,
			settings: settingsItem,
			lock: lockItem,
			shutdown: shutdownItem,
			battery: systemItem.powerToggle,
			laptopSpacer: systemItemInternal._laptopSpacer,
			desktopSpacer: systemItemInternal._desktopSpacer,
			box: systemItem,
		};
	}

	/**
	 * Applies visibility hiding and child reordering to the system items row.
	 */
	override onLoad() {
		if (!this.enabled) return;
		this.getItmes()
			.then((items) => {
				if (this.hideLayout) {
					this.maid.hideJob(items.box, () => true);
					return;
				}
				if (this.hideBattery) {
					this.maid.hideJob(items.battery, () => {
						(items.battery as unknown as { _sync: () => void })._sync();
					});
				}
				if (this.hideScreenshot) {
					this.maid.hideJob(items.screenshot, () => true);
				}
				if (this.hideLock) {
					this.maid.hideJob(items.lock, () => true);
				}
				if (this.hideShutdown) {
					this.maid.hideJob(items.shutdown, () => true);
				}
				if (this.hideSettings) {
					this.maid.hideJob(items.settings, () => true);
				}
				let last: Clutter.Actor | null = null;
				for (const [index, item] of this.order.entries()) {
					const current = items[item];
					if (index) items.box.child.set_child_above_sibling(current, last);
					last = current;
				}
			})
			.catch(Logger.error);
	}
	/**
	 * Performs no-op teardown; `this.maid` restores hidden actors on unload.
	 */
	override onUnload(): void {}
}
